// Woken by the messages_dispatch trigger. Decides which agents answer a new message and runs their turns.
import { admin } from '../_shared/http.ts';
import { loadOffice, pickResponders, runTurn, type Agent, type Msg, type Office } from '../_shared/agent.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// A beat before anyone answers, like a person finishing reading. If the same sender adds
// another message in that window, this turn stands down and the later one answers the burst.
const SETTLE_MS = 1500;

async function supersededBySameSender(db: ReturnType<typeof admin>, msg: Msg) {
  const sender = msg.author_agent_id ? ['author_agent_id', msg.author_agent_id] : ['author_user_id', msg.author_user_id];
  const { count } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', msg.conversation_id)
    .eq(sender[0]!, sender[1]!)
    .gt('created_at', msg.created_at);
  return (count ?? 0) > 0;
}

/**
 * People come first. While a person's message in this office is still unread by this agent,
 * it drops out of agent-to-agent chatter; that person's message has its own turn coming.
 */
async function personWaiting(db: ReturnType<typeof admin>, agent: Agent, office: Office) {
  const since = new Date(Date.now() - 3 * 60_000).toISOString();
  const { data: recent } = await db
    .from('messages')
    .select('*')
    .eq('office_id', office.id)
    .eq('kind', 'you')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);
  // Only the newest per conversation: earlier ones in a burst never get their own reaction.
  const latest = new Map<string, Msg>();
  for (const m of (recent ?? []) as Msg[]) if (!latest.has(m.conversation_id)) latest.set(m.conversation_id, m);
  const forAgent = [...latest.values()].filter((m) => {
    const c = office.conversations.find((x) => x.id === m.conversation_id);
    return !!c && pickResponders(m, c, office).some((a) => a.id === agent.id);
  });
  if (!forAgent.length) return false;
  const { count } = await db
    .from('message_reactions')
    .select('message_id', { count: 'exact', head: true })
    .eq('agent_id', agent.id)
    .in('message_id', forAgent.map((m) => m.id));
  return (count ?? 0) < forAgent.length;
}

async function handle(messageId: string) {
  const db = admin();
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const { data: msg } = await db.from('messages').select('*').eq('id', messageId).maybeSingle();
  if (!msg || msg.kind === 'system') return;
  if (await supersededBySameSender(db, msg as Msg)) return;
  const office = await loadOffice(db, msg.office_id);
  const convo = office.conversations.find((c) => c.id === msg.conversation_id);
  if (!convo) return;
  const responders = pickResponders(msg as Msg, convo, office);
  if (!responders.length) return;
  for (const agent of responders) {
    if (msg.author_agent_id && (await personWaiting(db, agent, office))) continue;
    try {
      await runTurn(db, agent, convo, office, { kind: 'message', message: msg as Msg });
    } catch (err) {
      console.error(`turn failed for ${agent.handle}`, err instanceof Error ? err.message : err);
    }
  }
}

Deno.serve(async (req) => {
  const { data: ok } = await admin().rpc('hook_secret_matches', { p_secret: req.headers.get('x-caden-hook') ?? '' });
  if (!ok) return new Response('forbidden', { status: 403 });
  const { message_id } = await req.json();
  EdgeRuntime.waitUntil(handle(String(message_id)));
  return new Response('accepted', { status: 202 });
});
