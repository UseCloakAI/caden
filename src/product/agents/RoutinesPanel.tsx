import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, MonoLabel, Panel, Switch, TextArea, TextField } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import type { Agent, Routine, RoutineSchedule } from '@/lib/types';
import { ErrorLine } from '../ui';

const KINDS: Array<{ id: RoutineSchedule['kind']; label: string }> = [
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Weekly' },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX = 5;

const pad = (n: number) => String(n).padStart(2, '0');

function describe(s: RoutineSchedule) {
  const at = `${pad(s.hour)}:${pad(s.minute)}`;
  if (s.kind === 'weekly') return `${DAYS[s.weekday ?? 1]} at ${at}`;
  return `${s.kind === 'daily' ? 'Every day' : 'Weekdays'} at ${at}`;
}

/** Scheduled instructions the agent carries out on its own, in the office. */
export function RoutinesPanel({ agent }: { agent: Agent }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<RoutineSchedule['kind']>('daily');
  const [time, setTime] = useState('09:00');
  const [weekday, setWeekday] = useState(1);
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('routines').select('*').eq('agent_id', agent.id).order('created_at');
    setRoutines((data ?? []) as Routine[]);
  }, [agent.id]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const [hour, minute] = time.split(':').map(Number);
    const schedule: RoutineSchedule = { kind, hour, minute, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(kind === 'weekly' ? { weekday } : {}) };
    const { error: err } = await supabase.from('routines').insert({ agent_id: agent.id, schedule, instruction: instruction.trim() });
    if (err) setError(errorCopy(err));
    else {
      setInstruction('');
      setAdding(false);
      await load();
    }
  };

  const toggle = async (r: Routine, enabled: boolean) => {
    const { error: err } = await supabase.from('routines').update({ enabled }).eq('id', r.id);
    if (err) setError(errorCopy(err));
    await load();
  };

  const remove = async (r: Routine) => {
    const { error: err } = await supabase.from('routines').delete().eq('id', r.id);
    if (err) setError(errorCopy(err));
    await load();
  };

  return (
    <Panel level="card" padding="var(--spacing-20)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
      <MonoLabel size="micro" tone="var(--text-body)">{`Routines · ${routines.length} of ${MAX}`}</MonoLabel>
      {routines.length === 0 && !adding ? (
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--text-body)' }}>
          {`${agent.name} only acts when someone writes. Give it a routine to act on a schedule.`}
        </span>
      ) : null}
      {routines.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-12)', padding: 'var(--spacing-12)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', flex: 1, minWidth: 0 }}>
            <MonoLabel size="tiny" tone="var(--color-cloud)">{describe(r.schedule)}</MonoLabel>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--text-body)' }}>{r.instruction}</span>
            <MonoLabel size="tiny" tone="var(--text-muted)">
              {r.enabled ? `Next ${new Date(r.next_run_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Off'}
            </MonoLabel>
          </div>
          <Switch checked={r.enabled} onChange={(on) => toggle(r, on)} aria-label="Routine on" />
          <Button variant="glass" icon="x" aria-label="Delete routine" onClick={() => remove(r)} />
        </div>
      ))}
      {adding ? (
        <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
          <div style={{ display: 'flex', gap: 'var(--spacing-8)', flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <Button key={k.id} type="button" variant="pill" onClick={() => setKind(k.id)} style={kind === k.id ? { background: 'var(--color-pure)', color: 'var(--color-void)' } : undefined}>
                {k.label}
              </Button>
            ))}
          </div>
          {kind === 'weekly' ? (
            <div style={{ display: 'flex', gap: 'var(--spacing-4)', flexWrap: 'wrap' }}>
              {DAYS.map((d, i) => (
                <Button key={d} type="button" variant="pill" onClick={() => setWeekday(i)} style={weekday === i ? { background: 'var(--color-pure)', color: 'var(--color-void)' } : undefined}>
                  {d}
                </Button>
              ))}
            </div>
          ) : null}
          <TextField label="Time" type="time" value={time} onChange={setTime} required />
          <TextArea
            label="Instruction"
            value={instruction}
            onChange={setInstruction}
            rows={3}
            maxLength={1000}
            required
            placeholder="Check with Zeph about the weekend plan and post a short summary to the office."
          />
          <div style={{ display: 'flex', gap: 'var(--spacing-8)' }}>
            <Button variant="primary" type="submit" disabled={!instruction.trim()}>Add routine</Button>
            <Button variant="text" type="button" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : routines.length < MAX ? (
        <Button variant="ghost" icon="clock" onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start' }}>New routine</Button>
      ) : null}
      <ErrorLine>{error}</ErrorLine>
    </Panel>
  );
}
