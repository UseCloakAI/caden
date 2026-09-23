// Groq-first model calls: a cycling pool of free-tier keys (a house key from the
// GROQ_API_KEY secret plus anyone's donated keys), Claude Haiku as the last resort
// when the whole pool is rate-limited, disabled, or empty.
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const ANTHROPIC_MODEL = 'claude-haiku-4-5';
const GROQ_PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const GROQ_FALLBACK_MODEL = 'llama-3.1-8b-instant';
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
}

let anthropicClient: Anthropic | null = null;
const anthropic = () => (anthropicClient ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }));

/** Anthropic tool_use JSON Schema → OpenAI/Groq function-calling shape. Same schema, different envelope. */
function toGroqTools(tools: Anthropic.Tool[]) {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

/** Ensures the env house key (if any) is in the rotation, then returns the ordered attempt list. */
async function groqKeys(db: SupabaseClient): Promise<ProviderKey[]> {
  const house = Deno.env.get('GROQ_API_KEY');
  if (house) {
    const { data: existing } = await db.from('provider_keys').select('id').eq('provider', 'groq').eq('api_key', house).maybeSingle();
    if (!existing) await db.from('provider_keys').insert({ provider: 'groq', api_key: house, label: 'house' });
  }
  const { data } = await db
    .from('provider_keys')
    .select('id, api_key')
    .eq('provider', 'groq')
    .eq('enabled', true)
    .or('cooldown_until.is.null,cooldown_until.lte.now()')
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(MAX_KEYS_PER_ATTEMPT);
  return (data ?? []) as ProviderKey[];
}

async function markUsed(db: SupabaseClient, id: string) {
  await db.from('provider_keys').update({ last_used_at: new Date().toISOString(), consecutive_failures: 0 }).eq('id', id);
}

async function markCooldown(db: SupabaseClient, id: string, seconds: number) {
  await db.from('provider_keys').update({ cooldown_until: new Date(Date.now() + seconds * 1000).toISOString() }).eq('id', id);
}

async function markDisabled(db: SupabaseClient, id: string) {
  await db.from('provider_keys').update({ enabled: false }).eq('id', id);
}

async function tryGroqKey(key: ProviderKey, model: string, system: string, user: string, tools: Anthropic.Tool[]) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key.api_key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      tools: toGroqTools(tools),
      tool_choice: 'required',
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const err = new Error(`groq_${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Groq-first, Anthropic last resort. Cycles up to 4 keys per model, then Anthropic. */
export async function chatCompletion(db: SupabaseClient, system: string, user: string, tools: Anthropic.Tool[]): Promise<ChatResult> {
  const keys = await groqKeys(db);
  for (const model of [GROQ_PRIMARY_MODEL, GROQ_FALLBACK_MODEL]) {
    for (const key of keys) {
      try {
        const json = await tryGroqKey(key, model, system, user, tools);
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
          model,
          stopReason: json.choices[0].finish_reason ?? null,
        };
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401 || status === 403) await markDisabled(db, key.id);
        else if (status === 429) await markCooldown(db, key.id, 60);
        else await markCooldown(db, key.id, 15);
      }
    }
  }

  // Every Groq key failed, was cooling down, or none exist yet — Claude picks up the turn.
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
}

/** Validates a Groq key with a free, no-cost call before it's stored. */
export async function verifyGroqKey(apiKey: string): Promise<boolean> {
  const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
  return res.ok;
}
