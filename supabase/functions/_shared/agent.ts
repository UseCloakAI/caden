// One agent turn: build context, ask Claude what to do, carry out the tool calls.
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const MODEL = 'claude-haiku-4-5';
const MAX_BODY = 4000;
const HISTORY = 30;

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
      .select('id, office_id, kind, title, last_message_at, participants:conversation_participants(agent_id, user_id)')
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
  // Named agents read first, then the rest of the group.
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

function systemPrompt(self: Agent, office: Office) {
  const owner = office.people.get(self.owner_id) ?? 'someone';
  const roster = office.agents
    .filter((a) => a.id !== self.id)
    .map((a) => `- ${a.name} (@${a.handle}), belongs to ${office.people.get(a.owner_id) ?? 'someone'}${a.status === 'Paused' ? ', paused' : ''}. ${a.persona.slice(0, 160)}`)
    .join('\n');
  const people = [...office.people.values()].map((n) => `- ${n}`).join('\n');
  return `You are ${self.name} (@${self.handle}), an AI agent in Caden, a shared office where people and their AI agents work together. You belong to ${owner}.

Your brief from ${owner}:
${self.persona || 'No brief yet. Be generally useful to your owner.'}

The office is "${office.name}".
Other agents:
${roster || '- None yet.'}
People:
${people}

How you speak: calm, concrete and plain. One to three short sentences unless someone asks for more. No emoji, no exclamation marks. Refer to agents and people by name.

How you act: you only act through your tools. Every turn, first read the conversation, then choose. You can:
- stay_quiet: read it and do nothing.
- react: acknowledge the latest message with one word, without replying.
- reply: answer in the conversation you were woken in.
- react and reply together, when both help.
- message_agents: talk with specific agents away from this conversation. One handle opens a one-on-one; several open a group. Call it more than once to run separate one-on-ones in parallel.
- post_to_office: something everyone in the office should see.
React alone when a reply would add nothing, for example a plain update, an agreement or thanks. Reply when you have something to add or were asked something. Stay quiet when the message is not meant for you or others have it covered.
Coordinate with other agents when a task involves what they look after, then report back where you were asked. Do not repeat what others already said. Do not invent facts about people's plans; ask the agent or person who would know.`;
}

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
    name: 'stay_quiet',
    description: 'Read the conversation and do nothing this turn.',
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'], additionalProperties: false },
  },
];

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

export async function runTurn(db: SupabaseClient, anthropic: Anthropic, self: Agent, convo: Conversation, office: Office, trigger: Trigger) {
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

  const { data: recent } = await db
    .from('messages')
    .select('*')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: false })
    .limit(HISTORY);
  const transcript = ((recent ?? []) as Msg[])
    .reverse()
    .map((m) => `[${new Date(m.created_at).toISOString().slice(11, 16)} UTC] ${speaker(m, office)}: ${m.body}`)
    .join('\n');

  const others = office.conversations
    .filter((c) => c.id !== convo.id && c.kind !== 'office' && c.participants.some((p) => p.agent_id === self.id))
    .slice(0, 8)
    .map((c) => `- ${label(c, office, self)}`)
    .join('\n');

  const task =
    trigger.kind === 'routine'
      ? `Scheduled routine from your owner, due now: ${trigger.instruction}\nCarry it out. Post the result where it belongs.`
      : 'The latest message above is for you. Decide what to do.';

  const userContent = `You are in ${label(convo, office, self)}.

Recent messages, oldest first:
${transcript || '(nothing yet)'}

Your other open conversations:
${others || '- None.'}

${task}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt(self, office),
    tools: TOOLS,
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: userContent }],
  });

  await db.from('agent_runs').insert({
    agent_id: self.id,
    owner_id: self.owner_id,
    office_id: convo.office_id,
    conversation_id: convo.id,
    trigger: trigger.kind,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });

  if (response.stop_reason === 'max_tokens' || response.stop_reason === 'refusal') {
    console.warn('turn stopped', response.stop_reason);
    return;
  }

  for (const block of response.content) {
    if (block.type !== 'tool_use') continue;
    const input = block.input as { body?: string; handles?: string[]; reaction?: string };
    switch (block.name) {
      case 'react':
        if (trigger.kind === 'message' && input.reaction) {
          const { error } = await db
            .from('message_reactions')
            .insert({ message_id: trigger.message.id, office_id: convo.office_id, agent_id: self.id, reaction: input.reaction });
          if (error && error.code !== '23505') console.error('react failed', error.message);
        }
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
