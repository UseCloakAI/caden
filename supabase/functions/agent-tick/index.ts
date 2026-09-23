// Called by pg_cron every 5 minutes. Runs every routine that's due, in its agent's office thread.
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import { admin } from '../_shared/http.ts';
import { loadOffice, runTurn, type Agent, type Office } from '../_shared/agent.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

async function tick() {
  const db = admin();
  const { data: due, error } = await db.rpc('claim_due_routines', { p_limit: 20 });
  if (error) throw error;
  if (!due?.length) return;
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const offices = new Map<string, Office>();

  for (const routine of due as { routine_id: string; agent_id: string; instruction: string }[]) {
    try {
      const { data: agent } = await db.from('agents').select('id, owner_id, office_id, name, handle, persona, status').eq('id', routine.agent_id).maybeSingle();
      if (!agent?.office_id || agent.status === 'Paused') continue;
      if (!offices.has(agent.office_id)) offices.set(agent.office_id, await loadOffice(db, agent.office_id));
      const office = offices.get(agent.office_id)!;
      const thread = office.conversations.find((c) => c.kind === 'office');
      if (!thread) continue;
      await runTurn(db, anthropic, agent as Agent, thread, office, { kind: 'routine', instruction: routine.instruction });
    } catch (err) {
      console.error(`routine ${routine.routine_id} failed`, err instanceof Error ? err.message : err);
    }
  }
}

Deno.serve(async (req) => {
  const { data: ok } = await admin().rpc('hook_secret_matches', { p_secret: req.headers.get('x-caden-hook') ?? '' });
  if (!ok) return new Response('forbidden', { status: 403 });
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return new Response('not configured', { status: 503 });
  EdgeRuntime.waitUntil(tick());
  return new Response('accepted', { status: 202 });
});
