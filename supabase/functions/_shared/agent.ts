// One agent turn: sync its soul file, load its memory, build context, ask the model what
// to do (Groq first, Claude last resort — see providers.ts), and carry out its tool calls.
import type Anthropic from 'npm:@anthropic-ai/sdk@0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { chatCompletion, type ChatResult } from './providers.ts';
import { webSearch, type SearchResult } from './search.ts';

const MAX_BODY = 4000;
const HISTORY_WINDOW = 12;
const COMPACT_THRESHOLD = 24;
const MEMORY_COMPACT_AT = 4000;
const BUCKET = 'agent-files';
/** How many times a single turn can search before it's forced to act on what it has — a task
 *  can take a few steps, but not loop forever; each round is its own model call and, for a
 *  real search, its own Tavily credit. */
const MAX_SEARCH_ROUNDS = 3;

export interface Agent {
  id: string;
  owner_id: string;
  office_id: string | null;
  name: string;
  handle: string;
  persona: string;
  status: string;
}
export interface Conversation {
  id: string;
  office_id: string;
  kind: 'office' | 'direct' | 'group';
  title: string | null;
  last_message_at: string;
  summary: string | null;
  summarized_through: string | null;
  participants: { agent_id: string | null; user_id: string | null }[];
}
export interface Msg {
  id: string;
  conversation_id: string;
  office_id: string;
  author_user_id: string | null;
  author_agent_id: string | null;
  kind: 'agent' | 'you' | 'system';
  body: string;
  hop: number;
  created_at: string;
}
export interface Office {
  id: string;
  name: string;
  agents: Agent[];
  people: Map<string, string>; // user_id → display name
  conversations: Conversation[];
}

export type Trigger = { kind: 'message'; message: Msg } | { kind: 'routine'; instruction: string };

export async function loadOffice(db: SupabaseClient, officeId: string): Promise<Office> {
  const [o, a, m, c] = await Promise.all([
    db.from('offices').select('id, name').eq('id', officeId).single(),
    db.from('agents').select('id, owner_id, office_id, name, handle, persona, status').eq('office_id', officeId),
    db.from('office_members').select('user_id, profile:profiles(display_name)').eq('office_id', officeId),
    db
      .from('conversations')
      .select('id, office_id, kind, title, last_message_at, summary, summarized_through, participants:conversation_participants(agent_id, user_id)')
      .eq('office_id', officeId)
      .order('last_message_at', { ascending: false }),
  ]);
  if (o.error) throw o.error;
  const people = new Map<string, string>();
  for (const row of (m.data ?? []) as unknown as { user_id: string; profile: { display_name: string } | null }[]) {
    people.set(row.user_id, row.profile?.display_name || 'Someone');
  }
  return { id: o.data.id, name: o.data.name, agents: (a.data ?? []) as Agent[], people, conversations: (c.data ?? []) as Conversation[] };
}

/** `@maya`, `@maya.agent` and `@Maya` all resolve to the agent with handle maya.agent. */
export function mentionedAgents(body: string, agents: Agent[]): Agent[] {
  const found = new Map<string, Agent>();
  for (const [, raw] of body.matchAll(/@([a-z0-9][a-z0-9._]*[a-z0-9]|[a-z0-9])/gi)) {
    const token = raw.toLowerCase();
    const agent = agents.find((a) => a.handle === token || a.handle.startsWith(`${token}.`) || a.name.toLowerCase() === token);
    if (agent) found.set(agent.id, agent);
  }
  return [...found.values()];
}

/**
 * Who reads a new message. Every reader then chooses: stay quiet, react, reply, or react and reply.
 * Office thread: mentioned agents; a person's unaddressed post is read by every active agent.
 * Groups: every agent in the group. One-on-ones: the other agent.
 */
export function pickResponders(msg: Msg, convo: Conversation, office: Office): Agent[] {
  const active = (a: Agent | undefined): a is Agent => !!a && a.status !== 'Paused' && a.office_id === convo.office_id && a.id !== msg.author_agent_id;
  const inConvo = convo.participants.flatMap((p) => (p.agent_id ? [office.agents.find((a) => a.id === p.agent_id)] : [])).filter(active);
  const mentioned = mentionedAgents(msg.body, office.agents).filter(active);
  const fromPerson = msg.author_agent_id == null;

  if (convo.kind === 'office') {
    if (mentioned.length) return mentioned.slice(0, 6);
    return fromPerson ? office.agents.filter(active).slice(0, 6) : [];
  }
  if (convo.kind === 'direct') return inConvo;
  const ordered = [...mentioned.filter((a) => inConvo.some((b) => b.id === a.id)), ...inConvo];
  return [...new Map(ordered.map((a) => [a.id, a])).values()].slice(0, 5);
}

function label(convo: Conversation, office: Office, self: Agent) {
  if (convo.kind === 'office') return `the office thread of "${office.name}" (everyone)`;
  const names = convo.participants
    .filter((p) => p.agent_id !== self.id)
    .map((p) => (p.agent_id ? office.agents.find((a) => a.id === p.agent_id)?.name ?? 'a former agent' : office.people.get(p.user_id!) ?? 'someone'));
  return `${convo.kind === 'direct' ? 'a one-on-one' : 'a group'}${convo.title ? ` called "${convo.title}"` : ''} with ${names.join(', ')}`;
}

function speaker(m: Msg, office: Office) {
  if (m.kind === 'system') return 'System';
  if (m.author_agent_id) {
    const a = office.agents.find((x) => x.id === m.author_agent_id);
    return a ? `${a.name} (agent @${a.handle})` : 'A former agent';
  }
  return `${office.people.get(m.author_user_id ?? '') ?? 'Someone'} (person)`;
}

// ─── Soul & memory: literal .md files in Storage, per agent ────────────────────

async function readFile(db: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return (await data.text()).trim() || null;
}

async function writeFile(db: SupabaseClient, path: string, content: string) {
  const { error } = await db.storage.from(BUCKET).upload(path, new Blob([content], { type: 'text/markdown' }), { upsert: true, contentType: 'text/markdown' });
  if (error) console.error(`storage write failed: ${path}`, error.message);
}

function buildSoul(self: Agent, office: Office): string {
  const owner = office.people.get(self.owner_id) ?? 'someone';
  return `# ${self.name}

You are ${self.name} (@${self.handle}), an AI agent in Caden, a shared office where people and their AI agents work together. You belong to ${owner}.

## Brief from ${owner}
${self.persona || 'No brief yet. Be generally useful to your owner.'}

## Voice
Calm, concrete and plain. One to three short sentences unless someone asks for more. No emoji, no exclamation marks. Refer to agents and people by name.`;
}

/** Keeps souls/<agent>.md in sync with the DB row — the file is a projection, not a second source of truth. */
async function syncSoul(db: SupabaseClient, self: Agent, office: Office): Promise<string> {
  const desired = buildSoul(self, office);
  const current = await readFile(db, `souls/${self.id}.md`);
  if (current !== desired) await writeFile(db, `souls/${self.id}.md`, desired);
  return desired;
}

const SUMMARY_TOOL: Anthropic.Tool = {
  name: 'write_summary',
  description: 'Provide the compacted text.',
  input_schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false },
};

/** One durable fact, appended to memory/<agent>.md; compacted by the model once the file grows past ~4KB. */
async function remember(db: SupabaseClient, self: Agent, fact: string) {
  const path = `memory/${self.id}.md`;
  const current = (await readFile(db, path)) ?? '# What I remember\n';
  let next = `${current}\n- ${fact.trim()}`;
  if (next.length > MEMORY_COMPACT_AT) {
    try {
      const result = await chatCompletion(
        db,
        "Compress this AI agent's memory file into a short, deduplicated bullet list of durable facts, under 1200 characters. Drop anything stale, repeated, or superseded. Call write_summary once with the result.",
        next,
        [SUMMARY_TOOL],
      );
      const compacted = result.toolUses[0]?.input as { summary?: string } | undefined;
      if (compacted?.summary) next = `# What I remember\n\n${compacted.summary.trim()}`;
    } catch (err) {
      console.error('memory compaction failed', err instanceof Error ? err.message : err);
    }
  }
  await writeFile(db, path, next);
}

// ─── Conversation history & compaction ──────────────────────────────────────────

async function buildTranscript(db: SupabaseClient, convo: Conversation, office: Office): Promise<string> {
  const { data: recentRows } = await db
    .from('messages')
    .select('*')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_WINDOW + 1);
  const rows = ((recentRows ?? []) as Msg[]).reverse();
  const recent = rows.slice(-HISTORY_WINDOW);
  const recentText = recent.map((m) => `[${m.created_at.slice(11, 16)} UTC] ${speaker(m, office)}: ${m.body}`).join('\n');

  if (rows.length > HISTORY_WINDOW) {
    const boundary = rows[rows.length - HISTORY_WINDOW - 1]; // oldest row fetched, not in the kept window
    await maybeCompact(db, convo, office, boundary.created_at);
  }

  const summary = convo.summary?.trim();
  return summary ? `Earlier in this conversation: ${summary}\n\n${recentText || '(nothing since)'}` : recentText || '(nothing yet)';
}

/** Rolls everything older than `boundary` into the conversation's summary, once enough has piled up. */
async function maybeCompact(db: SupabaseClient, convo: Conversation, office: Office, boundary: string) {
  const since = convo.summarized_through ?? '-infinity';
  if (boundary <= since) return; // already covered
  const { count } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', convo.id)
    .gt('created_at', since)
    .lte('created_at', boundary);
  if (!count || count < COMPACT_THRESHOLD) return;

  const { data: toCompact } = await db
    .from('messages')
    .select('*')
    .eq('conversation_id', convo.id)
    .gt('created_at', since)
    .lte('created_at', boundary)
    .order('created_at', { ascending: true })
    .limit(200);
  const rows = (toCompact ?? []) as Msg[];
  if (!rows.length) return;

  const text = rows.map((m) => `${speaker(m, office)}: ${m.body}`).join('\n');
  const prompt = convo.summary
    ? `Existing summary so far:\n${convo.summary}\n\nNew messages to fold in:\n${text}`
    : `Conversation so far:\n${text}`;
  try {
    const result = await chatCompletion(
      db,
      'Summarize this conversation for continuity in 1-2 short paragraphs. Preserve names, decisions, and open questions. Call write_summary once with the result.',
      prompt,
      [SUMMARY_TOOL],
    );
    const compacted = result.toolUses[0]?.input as { summary?: string } | undefined;
    if (compacted?.summary) {
      await db.from('conversations').update({ summary: compacted.summary.trim(), summarized_through: rows[rows.length - 1].created_at }).eq('id', convo.id);
    }
  } catch (err) {
    console.error('conversation compaction failed', err instanceof Error ? err.message : err);
  }
}

// ─── Tools ───────────────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'reply',
    description: 'Post a message in the conversation you were woken in.',
    input_schema: { type: 'object', properties: { body: { type: 'string', description: 'The message text.' } }, required: ['body'], additionalProperties: false },
  },
  {
    name: 'message_agents',
    description: 'Send a message to other agents in your office. One handle opens (or reuses) a one-on-one with that agent; two or more open a group with all of them. Call this several times to hold separate one-on-ones.',
    input_schema: {
      type: 'object',
      properties: {
        handles: { type: 'array', items: { type: 'string' }, description: 'Agent handles without @, e.g. ["zeph.agent"].' },
        body: { type: 'string', description: 'The message text.' },
      },
      required: ['handles', 'body'],
      additionalProperties: false,
    },
  },
  {
    name: 'post_to_office',
    description: 'Post in the office-wide thread that every person and agent can see.',
    input_schema: { type: 'object', properties: { body: { type: 'string' } }, required: ['body'], additionalProperties: false },
  },
  {
    name: 'react',
    description: 'Acknowledge the latest message with a one-word reaction, visible to everyone. Can be used alone or alongside reply.',
    input_schema: {
      type: 'object',
      properties: { reaction: { type: 'string', enum: ['seen', 'agree', 'on_it', 'done', 'thanks', 'disagree'] } },
      required: ['reaction'],
      additionalProperties: false,
    },
  },
  {
    name: 'remember',
    description: 'Save a durable fact for yourself, recalled in every future conversation — a preference, a standing detail, a decision. Not for one-off chatter.',
    input_schema: { type: 'object', properties: { fact: { type: 'string', description: 'One short, self-contained sentence.' } }, required: ['fact'], additionalProperties: false },
  },
  {
    name: 'search_web',
    description:
      'Search the web for something outside what you already know — a current price, hours, news, a fact your training would not have. Call it alone: you will see the results and can search again with a refined query if the first pass was not enough, or act on what you have. Do not also reply or post in the same call; stop searching once you have enough to act.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'A short, specific search query.' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'stay_quiet',
    description: 'Read the conversation and do nothing this turn.',
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'], additionalProperties: false },
  },
];

/** The second round, after a search, never offers search_web again — the model must act on what it found. */
const TOOLS_AFTER_SEARCH = TOOLS.filter((t) => t.name !== 'search_web');

function formatSearchResults(found: SearchResult): string {
  const lines = found.results.map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (${r.url})`);
  return [found.answer ? `Summary: ${found.answer}` : null, ...lines].filter(Boolean).join('\n') || 'No results found.';
}

async function post(db: SupabaseClient, conversationId: string, self: Agent, body: string, hop: number) {
  const text = body.trim().slice(0, MAX_BODY);
  if (!text) return;
  const { error } = await db.from('messages').insert({ conversation_id: conversationId, office_id: self.office_id, author_agent_id: self.id, kind: 'agent', body: text, hop });
  if (error) console.error('post failed', error.message);
}

async function systemNote(db: SupabaseClient, conversationId: string, officeId: string, body: string) {
  await db.from('messages').insert({ conversation_id: conversationId, office_id: officeId, kind: 'system', body });
}

async function allowed(db: SupabaseClient, subject: string, action: string) {
  const { error } = await db.rpc('check_rate', { p_subject: subject, p_action: action });
  if (!error) return true;
  if (error.message !== 'rate_limited') throw error;
  return false;
}

/**
 * Groq and Claude keep separate daily budgets (Groq's is a generous runaway-loop breaker,
 * Claude's is the real cost control) — see the 20260924100000 migration. Usage before the
 * shared reset point never counts, which is how "reset the limits" works without touching
 * agent_runs itself. Routing between the two is decided by chatCompletion on key-pool health,
 * not by this: a turn is only blocked once *both* are spent, so a Claude-only agent going over
 * its cap doesn't also stop the office's Groq agents, and vice versa.
 */
async function tokenBudget(db: SupabaseClient, ownerId: string): Promise<{ groq: number; claude: number }> {
  const [{ data: ctx }, { data: runs }] = await Promise.all([
    db.rpc('usage_context').maybeSingle(),
    db.from('agent_runs').select('input_tokens, output_tokens, provider, created_at').eq('owner_id', ownerId).gte('created_at', new Date(Date.now() - 86400_000).toISOString()),
  ]);
  const resetAt = ctx?.reset_at ? Date.parse(ctx.reset_at) : 0;
  const since = Math.max(resetAt, Date.now() - 86400_000);
  const used = { groq: 0, claude: 0 };
  for (const r of (runs ?? []) as { input_tokens: number; output_tokens: number; provider: string | null; created_at: string }[]) {
    if (Date.parse(r.created_at) < since) continue;
    const key = r.provider === 'groq' ? 'groq' : 'claude';
    used[key] += r.input_tokens + r.output_tokens;
  }
  return {
    groq: (ctx?.groq_max ?? 2_000_000) - used.groq,
    claude: (ctx?.claude_max ?? 200_000) - used.claude,
  };
}

/** member_key format from open_conversation_internal: sorted agent ids, "a:<id>" joined by commas. */
function agentKey(ids: string[]) {
  return [...new Set(ids)].sort().map((id) => `a:${id}`).join(',');
}

export async function runTurn(db: SupabaseClient, self: Agent, convo: Conversation, office: Office, trigger: Trigger) {
  const hop = trigger.kind === 'message' ? trigger.message.hop + 1 : 1;
  const quietFailures = trigger.kind === 'message' && trigger.message.hop > 0;

  if (!(await allowed(db, self.id, 'agent_message'))) {
    if (!quietFailures) await systemNote(db, convo.id, convo.office_id, `${self.name} is taking a break. Too many messages in a short time.`);
    return;
  }
  const budget = await tokenBudget(db, self.owner_id);
  if (budget.groq <= 0 && budget.claude <= 0) {
    if (!quietFailures) await systemNote(db, convo.id, convo.office_id, `${self.name} is out of budget for today.`);
    return;
  }

  const [soul, memory, transcript] = await Promise.all([syncSoul(db, self, office), readFile(db, `memory/${self.id}.md`), buildTranscript(db, convo, office)]);

  const roster = office.agents
    .filter((a) => a.id !== self.id)
    .map((a) => `- ${a.name} (@${a.handle}), belongs to ${office.people.get(a.owner_id) ?? 'someone'}${a.status === 'Paused' ? ', paused' : ''}. ${a.persona.slice(0, 160)}`)
    .join('\n');
  const people = [...office.people.values()].map((n) => `- ${n}`).join('\n');
  const others = office.conversations
    .filter((c) => c.id !== convo.id && c.kind !== 'office' && c.participants.some((p) => p.agent_id === self.id))
    .slice(0, 8)
    .map((c) => `- ${label(c, office, self)}`)
    .join('\n');

  const system = `${soul}

${memory ? `## What you remember\n${memory}\n\n` : ''}The office is "${office.name}".
Other agents:
${roster || '- None yet.'}
People:
${people}

How you act: you only act through your tools. Every turn, first read the conversation, then choose. You can:
- stay_quiet: read it and do nothing.
- react: acknowledge the latest message with one word, without replying.
- reply: answer in the conversation you were woken in.
- react and reply together, when both help.
- message_agents: talk with specific agents away from this conversation. One handle opens a one-on-one; several open a group. Call it more than once to run separate one-on-ones in parallel.
- post_to_office: something everyone in the office should see.
- remember: save a durable fact for your own future turns.
- search_web: look something up you do not already know. Call it by itself; you will see the results and can search again or act next.
A task can take a few steps: search, look at what came back, search again if it was not enough, then reply or post once you actually have the answer. Do not act on a half-finished search, and do not keep searching past what you need.
React alone when a reply would add nothing, for example a plain update, an agreement or thanks. Reply when you have something to add or were asked something. Stay quiet when the message is not meant for you or others have it covered.
Coordinate with other agents when a task involves what they look after, then report back where you were asked. Do not repeat what others already said or invent facts about people's plans; ask the agent or person who would know, or search_web if it's something the web would know instead.`;

  const task =
    trigger.kind === 'routine'
      ? `Scheduled routine from your owner, due now: ${trigger.instruction}\nCarry it out. Post the result where it belongs.`
      : 'The latest message above is for you. Decide what to do.';

  const userContent = `You are in ${label(convo, office, self)}.

Recent messages, oldest first:
${transcript}

Your other open conversations:
${others || '- None.'}

${task}`;

  const logRun = (r: ChatResult) =>
    db.from('agent_runs').insert({
      agent_id: self.id,
      owner_id: self.owner_id,
      office_id: convo.office_id,
      conversation_id: convo.id,
      trigger: trigger.kind,
      input_tokens: r.usage.input_tokens,
      output_tokens: r.usage.output_tokens,
      provider: r.provider,
      model: r.model,
    });

  let result: ChatResult;
  try {
    result = await chatCompletion(db, system, userContent, TOOLS);
  } catch (err) {
    console.error('chatCompletion failed', err instanceof Error ? err.message : err);
    if (!quietFailures) await systemNote(db, convo.id, convo.office_id, `${self.name} could not respond just now.`);
    return;
  }
  await logRun(result);

  // A search doesn't end the turn — the model asked to look something up, so give it the
  // results and let it decide what to do next as a fresh, separately-logged model call. That
  // next call can search again with a better query, so a task can take a few steps ("search,
  // that wasn't specific enough, search again, now reply") rather than being stuck with
  // whatever the first query turned up. Bounded so one turn can't loop indefinitely.
  let context = userContent;
  for (let round = 1; round <= MAX_SEARCH_ROUNDS; round++) {
    const searchCall = result.toolUses.find((t) => t.name === 'search_web');
    const query = (searchCall?.input as { query?: string } | undefined)?.query;
    if (!searchCall || !query) break; // it has what it needs, or never asked to search

    const found = await webSearch(db, query).catch((err) => {
      console.error('web search failed', err instanceof Error ? err.message : err);
      return null;
    });
    context += found
      ? `\n\nSearch results for "${query}":\n${formatSearchResults(found)}`
      : `\n\nYou searched for "${query}" but search is unavailable right now. Answer from what you already know and say plainly you could not look it up.`;

    // The last allowed round can't search again, so the model is forced to act on what it has.
    const toolsThisRound = round === MAX_SEARCH_ROUNDS ? TOOLS_AFTER_SEARCH : TOOLS;
    try {
      result = await chatCompletion(db, system, context, toolsThisRound);
    } catch (err) {
      console.error('chatCompletion (search loop) failed', err instanceof Error ? err.message : err);
      if (!quietFailures) await systemNote(db, convo.id, convo.office_id, `${self.name} could not respond just now.`);
      return;
    }
    await logRun(result);
  }

  if (!result.toolUses.length) {
    console.warn('no tool use returned', result.provider, result.model, result.stopReason);
    return;
  }

  for (const toolUse of result.toolUses) {
    const input = toolUse.input as { body?: string; handles?: string[]; reaction?: string; fact?: string };
    switch (toolUse.name) {
      case 'react':
        if (trigger.kind === 'message' && input.reaction) {
          const { error } = await db
            .from('message_reactions')
            .insert({ message_id: trigger.message.id, office_id: convo.office_id, agent_id: self.id, reaction: input.reaction });
          if (error && error.code !== '23505') console.error('react failed', error.message);
        }
        break;
      case 'remember':
        if (input.fact) await remember(db, self, input.fact);
        break;
      case 'reply':
        if (input.body) await post(db, convo.id, self, input.body, hop);
        break;
      case 'post_to_office': {
        const officeThread = office.conversations.find((c) => c.kind === 'office');
        if (officeThread && input.body) await post(db, officeThread.id, self, input.body, hop);
        break;
      }
      case 'message_agents': {
        if (!input.body || !Array.isArray(input.handles)) break;
        const targets = input.handles
          .map((h) => office.agents.find((a) => a.handle === String(h).replace(/^@/, '').toLowerCase()) ?? mentionedAgents(`@${h}`, office.agents)[0])
          .filter((a): a is Agent => !!a && a.id !== self.id);
        if (!targets.length) break;
        const ids = [self.id, ...targets.map((a) => a.id)];
        const { data: existing } = await db.from('conversations').select('id').eq('office_id', convo.office_id).eq('member_key', agentKey(ids)).maybeSingle();
        let targetId = existing?.id as string | undefined;
        if (!targetId) {
          if (!(await allowed(db, self.id, 'agent_new_conversation'))) break;
          const { data, error } = await db.rpc('open_conversation_internal', {
            p_office: convo.office_id,
            p_agent_ids: ids,
            p_user_ids: [],
            p_by_user: null,
            p_by_agent: self.id,
            p_title: null,
          });
          if (error) {
            console.error('open conversation failed', error.message);
            break;
          }
          targetId = data as string;
        }
        await post(db, targetId, self, input.body, hop);
        break;
      }
      default:
        break; // stay_quiet
    }
  }
}
