// Called by pg_cron every 5 minutes. Runs every routine that's due, then writes system/heartbeat.md.
import { admin } from '../_shared/http.ts';
import { loadOffice, runTurn, type Agent, type Office } from '../_shared/agent.ts';
import { syncChipAvailability } from '../_shared/providers.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const BUCKET = 'agent-files';
const HEARTBEAT_HISTORY = 20;

async function writeHeartbeat(db: ReturnType<typeof admin>, entry: string) {
  const { data } = await db.storage.from(BUCKET).download('system/heartbeat.md');
  const prior = data ? await data.text() : '';
  const lines = prior.split('\n').filter((l) => l.startsWith('- ')).slice(-(HEARTBEAT_HISTORY - 1));
  const body = `# Heartbeat\n\n${[...lines, `- ${entry}`].join('\n')}\n`;
  await db.storage.from(BUCKET).upload('system/heartbeat.md', new Blob([body], { type: 'text/markdown' }), { upsert: true, contentType: 'text/markdown' });
}

async function tick() {
  const db = admin();
  const started = new Date().toISOString();
  const { data: due, error } = await db.rpc('claim_due_routines', { p_limit: 20 });
  if (error) throw error;
  const offices = new Map<string, Office>();
  let ran = 0;
  let failed = 0;

  for (const routine of (due ?? []) as { routine_id: string; agent_id: string; instruction: string }[]) {
    try {
      const { data: agent } = await db.from('agents').select('id, owner_id, office_id, name, handle, persona, status, chip_id, last_model, model_error_at').eq('id', routine.agent_id).maybeSingle();
      if (!agent?.office_id || agent.status === 'Paused') continue;
      if (!offices.has(agent.office_id)) offices.set(agent.office_id, await loadOffice(db, agent.office_id));
      const office = offices.get(agent.office_id)!;
      const thread = office.conversations.find((c) => c.kind === 'office');
      if (!thread) continue;
      await runTurn(db, agent as Agent, thread, office, { kind: 'routine', instruction: routine.instruction });
      ran++;
    } catch (err) {
      failed++;
      console.error(`routine ${routine.routine_id} failed`, err instanceof Error ? err.message : err);
    }
  }

  // Once an hour, check the store against what Groq actually serves.
  let served: number | null = null;
  if (new Date().getUTCMinutes() < 5) served = await syncChipAvailability(db).catch(() => null);

  const { data: stats } = await db.rpc('provider_key_stats').maybeSingle() as unknown as { data: { healthy: number; cooling_down: number } | null };
  await writeHeartbeat(
    db,
    `${started} · ${(due ?? []).length} due, ${ran} ran, ${failed} failed · groq keys: ${stats?.healthy ?? 0} healthy / ${stats?.cooling_down ?? 0} cooling${served != null ? ` · store synced (${served} models served)` : ''}`,
  );
}

Deno.serve(async (req) => {
  const { data: ok } = await admin().rpc('hook_secret_matches', { p_secret: req.headers.get('x-caden-hook') ?? '' });
  if (!ok) return new Response('forbidden', { status: 403 });
  EdgeRuntime.waitUntil(tick());
  return new Response('accepted', { status: 202 });
});
