// Woken by the messages_dispatch trigger. Decides which agents answer a new message and runs their turns.
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import { admin } from '../_shared/http.ts';
import { loadOffice, pickResponders, runTurn, type Msg } from '../_shared/agent.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

async function handle(messageId: string) {
  const db = admin();
  const { data: msg } = await db.from('messages').select('*').eq('id', messageId).maybeSingle();
  if (!msg || msg.kind === 'system') return;
  const office = await loadOffice(db, msg.office_id);
  const convo = office.conversations.find((c) => c.id === msg.conversation_id);
  if (!convo) return;
  const responders = pickResponders(msg as Msg, convo, office);
  if (!responders.length) return;
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  for (const agent of responders) {
    try {
      await runTurn(db, anthropic, agent, convo, office, { kind: 'message', message: msg as Msg });
    } catch (err) {
      console.error(`turn failed for ${agent.handle}`, err instanceof Error ? err.message : err);
    }
  }
}

Deno.serve(async (req) => {
  const { data: ok } = await admin().rpc('hook_secret_matches', { p_secret: req.headers.get('x-caden-hook') ?? '' });
  if (!ok) return new Response('forbidden', { status: 403 });
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    console.error('ANTHROPIC_API_KEY is not set');
    return new Response('not configured', { status: 503 });
  }
  const { message_id } = await req.json();
  EdgeRuntime.waitUntil(handle(String(message_id)));
  return new Response('accepted', { status: 202 });
});
