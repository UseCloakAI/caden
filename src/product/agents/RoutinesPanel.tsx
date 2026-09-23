import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Collapse, Icon, MonoLabel, SegmentedControl, Skeleton, Switch, TextArea, TextField, useToast, type StyleVars } from '@/ds';
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
  const toast = useToast();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<RoutineSchedule['kind']>('daily');
  const [time, setTime] = useState('09:00');
  const [weekday, setWeekday] = useState(1);
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    const [hour, minute] = time.split(':').map(Number);
    const schedule: RoutineSchedule = { kind, hour, minute, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(kind === 'weekly' ? { weekday } : {}) };
    const { error: err } = await supabase.from('routines').insert({ agent_id: agent.id, schedule, instruction: instruction.trim() });
    setBusy(false);
    if (err) setError(errorCopy(err));
    else {
      setInstruction('');
      setAdding(false);
      toast(`Routine added · ${describe(schedule)}`, { icon: 'clock' });
      await load();
    }
  };

  const toggle = async (r: Routine, enabled: boolean) => {
    setRoutines((list) => list?.map((x) => (x.id === r.id ? { ...x, enabled } : x)) ?? null);
    const { error: err } = await supabase.from('routines').update({ enabled }).eq('id', r.id);
    if (err) setError(errorCopy(err));
    await load();
  };

  const remove = async (r: Routine) => {
    setRoutines((list) => list?.filter((x) => x.id !== r.id) ?? null);
    const { error: err } = await supabase.from('routines').delete().eq('id', r.id);
    if (err) setError(errorCopy(err));
    else toast('Routine removed.', { icon: 'trash' });
    await load();
  };

  const count = routines?.length ?? 0;

  return (
    <section className="p-section" style={{ padding: 'var(--spacing-20)' }}>
      <div className="p-section__head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
          <MonoLabel size="micro" tone="var(--color-cloud)">Routines</MonoLabel>
          <p className="p-section__desc">{`${agent.name} only acts when someone writes, unless it has a routine.`}</p>
        </div>
        <span className="p-meter" aria-label={`${count} of ${MAX} routines`}>
          {Array.from({ length: MAX }, (_, i) => <i key={i} data-on={i < count || undefined} />)}
        </span>
      </div>
      {routines == null ? (
        <div className="p-stack" style={{ gap: 'var(--spacing-8)' }}>
          <Skeleton height={64} radius="var(--radius-md)" />
        </div>
      ) : null}
      <div className="p-stack c-stagger" style={{ gap: 'var(--spacing-8)' }}>
        {routines?.map((r, i) => (
          <div key={r.id} className="p-routine" data-off={!r.enabled || undefined} style={{ '--i': i } as StyleVars}>
            <span className="p-routine__icon"><Icon name="clock" size={16} tone={r.enabled ? 'pure' : 'muted'} /></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', flex: 1, minWidth: 0 }}>
              <MonoLabel size="tiny" tone="var(--color-cloud)">{describe(r.schedule)}</MonoLabel>
              <span className="p-routine__text">{r.instruction}</span>
              <MonoLabel size="tiny" tone="var(--text-muted)">
                {r.enabled ? `Next ${new Date(r.next_run_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Off'}
              </MonoLabel>
            </div>
            <Switch checked={r.enabled} onChange={(on) => toggle(r, on)} aria-label="Routine on" />
            <Button variant="text" size="sm" icon="x" aria-label="Delete routine" onClick={() => remove(r)} />
          </div>
        ))}
      </div>
      <Collapse open={adding}>
        <form onSubmit={add} className="p-routine-form">
          <SegmentedControl label="Repeat" options={KINDS} value={kind} onChange={setKind} />
          <Collapse open={kind === 'weekly'}>
            <div style={{ display: 'flex', gap: 'var(--spacing-4)', flexWrap: 'wrap' }}>
              {DAYS.map((d, i) => (
                <Button key={d} variant="pill" size="sm" pressed={weekday === i} onClick={() => setWeekday(i)}>{d}</Button>
              ))}
            </div>
          </Collapse>
          <TextField label="Time" type="time" value={time} onChange={setTime} required style={{ maxWidth: 180 }} />
          <TextArea
            label="Instruction"
            value={instruction}
            onChange={setInstruction}
            rows={3}
            maxLength={1000}
            required={adding}
            placeholder="Check with Zeph about the weekend plan and post a short summary to the office."
          />
          <div style={{ display: 'flex', gap: 'var(--spacing-8)' }}>
            <Button variant="primary" type="submit" loading={busy} disabled={!instruction.trim()}>Add routine</Button>
            <Button variant="text" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      </Collapse>
      {!adding && count < MAX && routines ? (
        <Button variant="ghost" icon="plus" onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start' }}>New routine</Button>
      ) : null}
      <ErrorLine>{error}</ErrorLine>
    </section>
  );
}
