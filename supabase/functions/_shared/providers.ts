// Groq-first model calls over a cycling pool of free-tier keys (a house key from the
// GROQ_API_KEY secret plus anyone's donated keys). The brain order is: the chip slotted
// into the agent, then the default chip, then Claude Haiku. If all three fail the call
// throws AllBrainsFailed and the agent gets its red light.
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const ANTHROPIC_MODEL = 'claude-haiku-4-5';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_KEYS_PER_ATTEMPT = 4;

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatResult {
  toolUses: ToolUse[];
  usage: { input_tokens: number; output_tokens: number };
  provider: 'groq' | 'anthropic';
  model: string;
  stopReason: string | null;
}

interface ProviderKey {
  id: string;
  api_key: string;
  model_cooldowns: Record<string, string>;
}

/** A store chip: a Groq model plus how hard it thinks. */
export interface Chip {
  id: string;
  name: string;
  model: string;
  reasoning_effort: 'low' | 'medium' | 'high' | null;
  live: boolean;
  is_default: boolean;
}

export class AllBrainsFailed extends Error {
  constructor(public tried: string[], public last: string) {
    super(`every brain failed (${tried.join(' → ')}): ${last}`);
  }
}

let anthropicClient: Anthropic | null = null;
const anthropic = () => (anthropicClient ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }));

/** Anthropic tool_use JSON Schema → OpenAI/Groq function-calling shape. Same schema, different envelope. */
function toGroqTools(tools: Anthropic.Tool[]) {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

/** Ensures the env house key (if any) is in the rotation, then returns keys least-recently used first. */
async function groqKeys(db: SupabaseClient): Promise<ProviderKey[]> {
  const house = Deno.env.get('GROQ_API_KEY');
  if (house) {
    const { data: existing } = await db.from('provider_keys').select('id').eq('provider', 'groq').eq('api_key', house).maybeSingle();
    if (!existing) await db.from('provider_keys').insert({ provider: 'groq', api_key: house, label: 'house' });
  }
  const { data } = await db
    .from('provider_keys')
    .select('id, api_key, model_cooldowns')
    .eq('provider', 'groq')
    .eq('enabled', true)
    .or('cooldown_until.is.null,cooldown_until.lte.now()')
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(12);
  return (data ?? []) as ProviderKey[];
}

async function markUsed(db: SupabaseClient, id: string) {
  await db.from('provider_keys').update({ last_used_at: new Date().toISOString(), consecutive_failures: 0 }).eq('id', id);
}

/** Groq limits are per model, so a 429 only benches this key for this model. */
async function markModelCooldown(db: SupabaseClient, key: ProviderKey, model: string, seconds: number) {
  key.model_cooldowns = { ...key.model_cooldowns, [model]: new Date(Date.now() + seconds * 1000).toISOString() };
  await db.from('provider_keys').update({ model_cooldowns: key.model_cooldowns }).eq('id', key.id);
}

async function markDisabled(db: SupabaseClient, id: string) {
  await db.from('provider_keys').update({ enabled: false }).eq('id', id);
}

const coolingFor = (key: ProviderKey, model: string) => {
  const until = key.model_cooldowns?.[model];
  return !!until && Date.parse(until) > Date.now();
};

let chipCache: { at: number; chips: Chip[] } | null = null;
/** The store catalog, cached for a minute per function instance. */
export async function loadChips(db: SupabaseClient): Promise<Chip[]> {
  if (chipCache && Date.now() - chipCache.at < 60_000) return chipCache.chips;
  const { data } = await db.from('model_chips').select('id, name, model, reasoning_effort, live, is_default');
  chipCache = { at: Date.now(), chips: (data ?? []) as Chip[] };
  return chipCache.chips;
}

/** Slotted chip first (if it's still served), then the default chip. */
async function brainOrder(db: SupabaseClient, chipId: string | null | undefined): Promise<Chip[]> {
  const chips = await loadChips(db);
  const order: Chip[] = [];
  const slotted = chips.find((c) => c.id === chipId);
  const fallback = chips.find((c) => c.is_default);
  if (slotted?.live) order.push(slotted);
  if (fallback && fallback.id !== slotted?.id) order.push(fallback);
  return order;
}

/** Groq says this model is gone: pull the chip off the shelf so nobody waits on it again. */
async function markChipDead(db: SupabaseClient, model: string) {
  await db.from('model_chips').update({ live: false, checked_at: new Date().toISOString() }).eq('model', model);
  chipCache = null;
}

async function tryGroqKey(key: ProviderKey, chip: Chip, system: string, user: string, tools: Anthropic.Tool[]) {
  const thinks = chip.model.startsWith('openai/gpt-oss');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key.api_key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: chip.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      tools: toGroqTools(tools),
      tool_choice: 'required',
      // Thinking tokens count against the cap, so reasoning chips get more room.
      max_completion_tokens: thinks && chip.reasoning_effort === 'high' ? 4096 : thinks ? 2048 : 1024,
      ...(thinks && chip.reasoning_effort ? { reasoning_effort: chip.reasoning_effort } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`groq_${res.status} ${text.slice(0, 200)}`) as Error & { status: number; body: string };
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

async function tryChip(db: SupabaseClient, keys: ProviderKey[], chip: Chip, system: string, user: string, tools: Anthropic.Tool[]): Promise<ChatResult | string> {
  let last = 'no Groq keys ready';
  let attempts = 0;
  for (const key of keys) {
    if (coolingFor(key, chip.model)) continue;
    if (attempts++ >= MAX_KEYS_PER_ATTEMPT) break;
    try {
      const json = await tryGroqKey(key, chip, system, user, tools);
      await markUsed(db, key.id);
      const message = json.choices[0].message;
      const toolUses: ToolUse[] = [];
      for (const call of message.tool_calls ?? []) {
        try {
          toolUses.push({ id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) });
        } catch {
          console.warn('groq returned unparsable tool arguments', call.function?.name);
        }
      }
      return {
        toolUses,
        usage: { input_tokens: json.usage?.prompt_tokens ?? 0, output_tokens: json.usage?.completion_tokens ?? 0 },
        provider: 'groq',
        model: chip.model,
        stopReason: json.choices[0].finish_reason ?? null,
      };
    } catch (err) {
      const e = err as { status?: number; body?: string; message?: string };
      last = e.message ?? String(err);
      if (e.status === 401 || e.status === 403) await markDisabled(db, key.id);
      else if (e.status === 429) await markModelCooldown(db, key, chip.model, 60);
      else if (e.status === 404 || /decommission|model_not_found|does not exist/i.test(e.body ?? '')) {
        await markChipDead(db, chip.model);
        return last; // no key will fix a model that's gone
      } else await markModelCooldown(db, key, chip.model, 15);
    }
  }
  return last;
}

/**
 * Slotted chip → default chip → Claude Haiku. Each Groq chip cycles up to 4 keys that aren't
 * benched for that model. Throws AllBrainsFailed when even Claude can't answer.
 */
export async function chatCompletion(db: SupabaseClient, system: string, user: string, tools: Anthropic.Tool[], chipId?: string | null): Promise<ChatResult> {
  const [keys, chips] = await Promise.all([groqKeys(db), brainOrder(db, chipId)]);
  const tried: string[] = [];
  let last = '';
  for (const chip of chips) {
    tried.push(chip.name);
    const result = await tryChip(db, keys, chip, system, user, tools);
    if (typeof result !== 'string') return result;
    last = result;
  }

  tried.push('Claude');
  try {
    const response = await anthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system,
      tools,
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: user }],
    });
    const toolUses: ToolUse[] = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input }));
    return {
      toolUses,
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
      provider: 'anthropic',
      model: ANTHROPIC_MODEL,
      stopReason: response.stop_reason,
    };
  } catch (err) {
    throw new AllBrainsFailed(tried, err instanceof Error ? err.message : `${last}; claude failed`);
  }
}

/** Marks each chip live or not against the models Groq actually serves right now. */
export async function syncChipAvailability(db: SupabaseClient) {
  const keys = await groqKeys(db);
  for (const key of keys.slice(0, 2)) {
    const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key.api_key}` } }).catch(() => null);
    if (!res?.ok) continue;
    const served = new Set(((await res.json()).data ?? []).map((m: { id: string }) => m.id));
    const chips = await loadChips(db);
    const now = new Date().toISOString();
    for (const chip of chips) {
      const live = served.has(chip.model);
      if (live !== chip.live) await db.from('model_chips').update({ live, checked_at: now }).eq('id', chip.id);
    }
    chipCache = null;
    return served.size;
  }
  return null;
}

/** Validates a Groq key with a free, no-cost call before it's stored. */
export async function verifyGroqKey(apiKey: string): Promise<boolean> {
  const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
  return res.ok;
}
