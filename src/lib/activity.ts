import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type ActivityState = 'idle' | 'reading' | 'thinking' | 'searching' | 'messaging' | 'writing';

export interface AgentActivity {
  agent_id: string;
  office_id: string;
  conversation_id: string | null;
  state: ActivityState;
  detail: string | null;
  updated_at: string;
}

/** A turn that crashed mid-way never writes 'idle'; treat anything older than this as over. */
const STALE_MS = 120_000;

/** Live "what is each agent doing" for the office, keyed by agent id. Idle and stale rows are dropped. */
export function useAgentActivity(officeId: string | undefined) {
  const [rows, setRows] = useState<Map<string, AgentActivity>>(new Map());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!officeId) return;
    let alive = true;
    supabase
      .from('agent_activity')
      .select('*')
      .eq('office_id', officeId)
      .then(({ data }) => alive && setRows(new Map(((data ?? []) as AgentActivity[]).map((r) => [r.agent_id, r]))));
    const channel = supabase
      .channel(`activity:${officeId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_activity', filter: `office_id=eq.${officeId}` }, (payload) => {
        const row = payload.new as AgentActivity;
        if (!row?.agent_id) return;
        setRows((prev) => new Map(prev).set(row.agent_id, row));
        setNow(Date.now());
      })
      .subscribe();
    // Re-render now and then so stale rows age out without a new event.
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [officeId]);

  const active = new Map<string, AgentActivity>();
  for (const [id, r] of rows) if (r.state !== 'idle' && now - Date.parse(r.updated_at) < STALE_MS) active.set(id, r);
  return active;
}

/** "searching "4 bed Corona"", "messaging Nova", "thinking". */
export function activityLabel(a: Pick<AgentActivity, 'state' | 'detail'>) {
  switch (a.state) {
    case 'reading':
      return 'reading';
    case 'thinking':
      return 'thinking';
    case 'searching':
      return a.detail ? `searching the web for “${a.detail}”` : 'searching the web';
    case 'messaging':
      return a.detail ? `messaging ${a.detail}` : 'messaging an agent';
    case 'writing':
      return 'typing';
    default:
      return '';
  }
}
