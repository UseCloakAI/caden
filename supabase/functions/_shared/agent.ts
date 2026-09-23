// One agent turn: sync its soul file, load its memory, build context, ask the model what
// to do (Groq first, Claude last resort — see providers.ts), and carry out its tool calls.
import type Anthropic from 'npm:@anthropic-ai/sdk@0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { AllBrainsFailed, chatCompletion, type ChatResult } from './providers.ts';

const MAX_BODY = 4000;
const HISTORY_WINDOW = 12;
const COMPACT_THRESHOLD = 24;
const MEMORY_COMPACT_AT = 4000;
const BUCKET = 'agent-files';

export interface Agent {
  id: string;
  owner_id: string;
  office_id: string | null;
  name: string;
  handle: string;
  persona: string;
  status: string;
  chip_id: string | null;
  last_model?: string | null;
  model_error_at?: string | null;
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
    db.from('agents').select('id, owner_id, office_id, name, handle, persona, status, chip_id, last_model, model_error_at').eq('office_id', officeId),
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
 * Who reads a new message. Every reader reacts, then chooses whether to say or do more.
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

export const REACTIONS = ['seen', 'on_it', 'agree', 'disagree', 'thanks', 'done'] as const;

/** Step 1 of every message turn: the glance. Always one reaction, shown before anything else. */
const REACT_TOOL: Anthropic.Tool = {
  name: 'react',
  description: 'Acknowledge the latest message with one reaction, the way a person reacts to a text.',
  input_schema: {
    type: 'object',
    properties: { reaction: { type: 'string', enum: [...REACTIONS] } },
    required: ['reaction'],
    additionalProperties: false,
  },
};

const ACTION_TOOLS: Anthropic.Tool[] = [
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
    name: 'post_in',
    description: 'Post in one of your other conversations, by its number from the "Your other conversations" list. Use it to answer someone waiting there or to report back.',
    input_schema: {
      type: 'object',
      properties: { conversation: { type: 'integer', description: 'The [number] from the list.' }, body: { type: 'string' } },
      required: ['conversation', 'body'],
      additionalProperties: false,
    },
  },
  {
    name: 'remember',
    description: 'Save a durable fact for yourself, recalled in every future conversation — a preference, a standing detail, a decision. Not for one-off chatter.',
    input_schema: { type: 'object', properties: { fact: { type: 'string', description: 'One short, self-contained sentence.' } }, required: ['fact'], additionalProperties: false },
  },
  {
    name: 'done',
    description: 'Finish this turn. Your reaction and anything you already sent stay visible.',
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'], additionalProperties: false },
  },
];

/** Model calls per turn: the first does react + act together; at most two follow-ups. */
const MAX_STEPS = 3;
/** The beat between a reaction showing and the words that follow it. */
const REACT_BEAT_MS = 800;

const FIRST_STEP = `Call react exactly once for the latest message, and in the same response call whatever else you will do this turn:
- seen: read it, nothing to add. on_it: you are acting on it. agree / disagree: you have a view. thanks / done: where they fit.
- Then reply, message other agents, post somewhere, remember — or call done if the reaction says enough.
At most one message per conversation this turn.`;

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

async function tokensLeft(db: SupabaseClient, ownerId: string) {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const [{ data: runs }, { data: limit }] = await Promise.all([
    db.from('agent_runs').select('input_tokens, output_tokens').eq('owner_id', ownerId).gte('created_at', since),
    db.from('limits').select('max').eq('action', 'claude_tokens').maybeSingle(),
  ]);
  const used = (runs ?? []).reduce((n, r) => n + r.input_tokens + r.output_tokens, 0);
  return (limit?.max ?? 200000) - used;
}

/** member_key format from open_conversation_internal: sorted agent ids, "a:<id>" joined by commas. */
function agentKey(ids: string[]) {
  return [...new Set(ids)].sort().map((id) => `a:${id}`).join(',');
}

/** Logs one model call against the agent's owner. */
async function logRun(db: SupabaseClient, self: Agent, convo: Conversation, trigger: Trigger, result: ChatResult) {
  await db.from('agent_runs').insert({
    agent_id: self.id,
    owner_id: self.owner_id,
    office_id: convo.office_id,
    conversation_id: convo.id,
    trigger: trigger.kind,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    provider: result.provider,
    model: result.model,
  });
}

/**
 * One agent turn, played out like a person: one model call decides the reaction and the actions
 * together; the reaction lands first, the words a beat later. A follow-up call only happens when a
 * one-on-one still needs words, or to tell the person who asked what was done elsewhere.
 * Nothing posts twice to the same conversation in one turn.
 */
export async function runTurn(db: SupabaseClient, self: Agent, convo: Conversation, office: Office, trigger: Trigger) {
  const hop = trigger.kind === 'message' ? trigger.message.hop + 1 : 1;
  const quietFailures = trigger.kind === 'message' && trigger.message.hop > 0;

  if (!(await allowed(db, self.id, 'agent_message'))) {
    if (!quietFailures) await systemNote(db, convo.id, convo.office_id, `${self.name} is taking a break. Too many messages in a short time.`);
    return;
  }
  if ((await tokensLeft(db, self.owner_id)) <= 0) {
    if (!quietFailures) await systemNote(db, convo.id, convo.office_id, `${self.name} is out of budget for today.`);
    return;
  }

  const elsewhere = office.conversations
    .filter((c) => c.id !== convo.id && (c.kind === 'office' || c.participants.some((p) => p.agent_id === self.id)))
    .slice(0, 8);
  const [soul, memory, transcript, lastElsewhere] = await Promise.all([
    syncSoul(db, self, office),
    readFile(db, `memory/${self.id}.md`),
    buildTranscript(db, convo, office),
    lastMessages(db, elsewhere.map((c) => c.id)),
  ]);

  const roster = office.agents
    .filter((a) => a.id !== self.id)
    .map((a) => `- ${a.name} (@${a.handle}), belongs to ${office.people.get(a.owner_id) ?? 'someone'}${a.status === 'Paused' ? ', paused' : ''}. ${a.persona.slice(0, 160)}`)
    .join('\n');
  const people = [...office.people.values()].map((n) => `- ${n}`).join('\n');
  const others = elsewhere
    .map((c, i) => {
      const last = lastElsewhere.get(c.id);
      if (!last) return `[${i + 1}] ${label(c, office, self)} — quiet`;
      const waiting = last.author_user_id && last.kind === 'you' ? ' — a person is waiting on a reply' : '';
      return `[${i + 1}] ${label(c, office, self)} — last, ${ago(last.created_at)}: ${speaker(last, office)}: "${last.body.slice(0, 120)}"${waiting}`;
    })
    .join('\n');

  const system = `${soul}

${memory ? `## What you remember\n${memory}\n\n` : ''}The office is "${office.name}".
Other agents:
${roster || '- None yet.'}
People:
${people}

How you act: like a person in a group chat, not a bot. You only act through your tools.
- Every message you are woken by gets a reaction. You never leave someone on read.
- A reaction alone is a complete answer when words would add nothing: a plain update, an agreement, a thanks, or a point someone already made.
- In a one-on-one you answer in words as well.
- Say each thing once. Never repeat yourself or restate what someone else just said; react agree instead.
- Do things now, never announce them. Instead of "heading to the main chat", post there. Instead of "I'll ask Joe", message Joe.
- When a person is waiting on you somewhere else, answer them there.
- When someone asks you to do something with another agent, do it, then tell the person who asked what you did.
- Don't @mention people; talk to them by name. Only @mention an agent when you need that agent to answer.
Do not invent facts about people's plans; ask the agent or person who would know.`;

  const task =
    trigger.kind === 'routine'
      ? `Scheduled routine from your owner, due now: ${trigger.instruction}\nCarry it out. Post the result where it belongs.`
      : 'The latest message above is for you.';

  const context = `You are in ${label(convo, office, self)}.

Recent messages, oldest first:
${transcript}

Your other conversations:
${others || '- None.'}

${task}`;

  const incoming = trigger.kind === 'message' ? trigger.message : null;
  const fromPerson = !!incoming && incoming.author_agent_id == null;
  // One-on-ones: people always get words back; between agents, only the first exchange must.
  const mustReply = convo.kind === 'direct' && !!incoming && (fromPerson || incoming.hop <= 1);
  const actions: string[] = [];
  const postedTo = new Set<string>(); // one message per conversation per turn, so nothing doubles up
  let reacted = !incoming;
  let delegated = false;
  let onlyReacted = false; // the model gave just the reaction and hasn't said whether more follows

  const say = async (conversationId: string, body: string | undefined) => {
    if (!body?.trim() || postedTo.has(conversationId)) return false;
    postedTo.add(conversationId);
    await post(db, conversationId, self, body, hop);
    return true;
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const repliedHere = postedTo.has(convo.id);
    let tools: Anthropic.Tool[];
    let instruction: string;
    if (step === 0) {
      tools = incoming ? [REACT_TOOL, ...ACTION_TOOLS] : ACTION_TOOLS;
      instruction = incoming ? FIRST_STEP : 'Act on the routine: post, message agents, remember — then call done.';
      if (mustReply) instruction += '\nThis is a one-on-one: include a reply.';
    } else if (onlyReacted && !(mustReply && !repliedHere)) {
      tools = ACTION_TOOLS;
      instruction = 'Your reaction is posted. Anything else — a reply, a message, a post — or call done if the reaction said enough.';
    } else if (mustReply && !repliedHere) {
      tools = ACTION_TOOLS.filter((t) => t.name === 'reply');
      instruction = 'You have not answered here yet. Reply in this conversation now, in words.';
    } else if (delegated && fromPerson && !repliedHere) {
      tools = ACTION_TOOLS.filter((t) => t.name === 'reply' || t.name === 'done');
      instruction = 'Tell the person who asked, in one short line, what you just did. Or call done if they already know.';
    } else break;

    const doneSoFar = actions.length ? `\n\nWhat you have done so far this turn:\n${actions.map((a) => `- ${a}`).join('\n')}` : '';
    let result: ChatResult;
    try {
      result = await chatCompletion(db, system, `${context}${doneSoFar}\n\n${instruction}`, tools, self.chip_id);
      await logRun(db, self, convo, trigger, result);
      // Only touch the row when something changed; every agents update re-syncs open offices.
      if (step === 0 && (result.model !== self.last_model || self.model_error_at)) {
        await db.from('agents').update({ last_model: result.model, model_error: null, model_error_at: null }).eq('id', self.id);
      }
    } catch (err) {
      console.error('turn step failed', err instanceof Error ? err.message : err);
      if (err instanceof AllBrainsFailed) {
        await db.from('agents').update({ model_error: `Tried ${err.tried.join(', ')}. ${err.last.slice(0, 200)}`, model_error_at: new Date().toISOString() }).eq('id', self.id);
      }
      if (step === 0 && !quietFailures) await systemNote(db, convo.id, convo.office_id, `${self.name} could not respond just now.`);
      break;
    }

    // The reaction lands first, on its own beat, then whatever else was decided.
    if (!reacted && incoming) {
      const picked = (result.toolUses.find((t) => t.name === 'react')?.input as { reaction?: string } | undefined)?.reaction;
      const reaction = REACTIONS.includes(picked as (typeof REACTIONS)[number]) ? picked! : 'seen';
      const { error } = await db.from('message_reactions').insert({ message_id: incoming.id, office_id: convo.office_id, agent_id: self.id, reaction });
      if (error && error.code !== '23505') console.error('react failed', error.message);
      actions.push(`reacted ${reaction.toUpperCase()} to the latest message`);
      reacted = true;
      if (result.toolUses.some((t) => t.name !== 'react' && t.name !== 'done')) await new Promise((r) => setTimeout(r, REACT_BEAT_MS));
    }

    onlyReacted = step === 0 && !!incoming && result.toolUses.every((t) => t.name === 'react');
    for (const toolUse of result.toolUses) {
      const input = toolUse.input as { body?: string; handles?: string[]; fact?: string; conversation?: number };
      switch (toolUse.name) {
        case 'reply':
          if (await say(convo.id, input.body)) actions.push(`replied here: "${input.body!.slice(0, 140)}"`);
          break;
        case 'post_to_office': {
          const officeThread = office.conversations.find((c) => c.kind === 'office');
          if (officeThread && (await say(officeThread.id, input.body))) actions.push(`posted to the office: "${input.body!.slice(0, 140)}"`);
          break;
        }
        case 'post_in': {
          const target = elsewhere[Number(input.conversation) - 1];
          if (target && (await say(target.id, input.body))) {
            actions.push(`posted in ${label(target, office, self)}: "${input.body!.slice(0, 140)}"`);
            delegated = true;
          }
          break;
        }
        case 'message_agents': {
          const sent = await messageAgents(db, self, convo, office, input.handles, input.body, hop, postedTo);
          if (sent) {
            actions.push(`messaged ${sent}: "${(input.body ?? '').slice(0, 140)}"`);
            delegated = true;
          }
          break;
        }
        case 'remember':
          if (input.fact) {
            await remember(db, self, input.fact);
            actions.push(`remembered: ${input.fact.slice(0, 140)}`);
          }
          break;
      }
    }
  }
}

/** The newest message in each of these conversations. */
async function lastMessages(db: SupabaseClient, conversationIds: string[]) {
  const latest = new Map<string, Msg>();
  if (!conversationIds.length) return latest;
  const { data } = await db.from('messages').select('*').in('conversation_id', conversationIds).neq('kind', 'system').order('created_at', { ascending: false }).limit(60);
  for (const m of (data ?? []) as Msg[]) if (!latest.has(m.conversation_id)) latest.set(m.conversation_id, m);
  return latest;
}

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** Opens (or reuses) a one-on-one or group with the named agents and posts there. Returns who it went to. */
async function messageAgents(
  db: SupabaseClient,
  self: Agent,
  convo: Conversation,
  office: Office,
  handles: string[] | undefined,
  body: string | undefined,
  hop: number,
  postedTo: Set<string>,
) {
  if (!body?.trim() || !Array.isArray(handles)) return null;
  const targets = handles
    .map((h) => office.agents.find((a) => a.handle === String(h).replace(/^@/, '').toLowerCase()) ?? mentionedAgents(`@${h}`, office.agents)[0])
    .filter((a): a is Agent => !!a && a.id !== self.id);
  if (!targets.length) return null;
  const ids = [self.id, ...targets.map((a) => a.id)];
  const { data: existing } = await db.from('conversations').select('id').eq('office_id', convo.office_id).eq('member_key', agentKey(ids)).maybeSingle();
  let targetId = existing?.id as string | undefined;
  if (!targetId) {
    if (!(await allowed(db, self.id, 'agent_new_conversation'))) return null;
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
      return null;
    }
    targetId = data as string;
  }
  if (postedTo.has(targetId)) return null;
  postedTo.add(targetId);
  await post(db, targetId, self, body, hop);
  return targets.map((a) => a.name).join(', ');
}
