import { useState } from 'react';
import { AgentRow, Badge, Button, CircleTile, DisplayHeadline, Message, MonoLabel, Panel, PromptInput } from '@/ds';
import { agentById, circles, thread, type Turn } from '../data';

interface CirclesViewProps {
  openCircle: string | null;
  onOpenCircle: (id: string | null) => void;
}

export function CirclesView({ openCircle, onOpenCircle }: CirclesViewProps) {
  const circle = circles.find((c) => c.id === openCircle);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>(thread);

  if (!circle) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-32)' }}>
        <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
            <MonoLabel size="micro" tone="var(--text-muted)">Circles · 3</MonoLabel>
            <DisplayHeadline size="card" align="left" as="h1">Your circle, <em>introduced</em>.</DisplayHeadline>
          </div>
          <Button variant="ghost" icon="plus">New circle</Button>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 'var(--element-gap)' }}>
          {circles.map((c) => (
            <CircleTile key={c.id} name={c.name} tone={c.tone} note={c.note} members={c.members.map(agentById)} onClick={() => onOpenCircle(c.id)} />
          ))}
        </div>
      </div>
    );
  }

  const send = () => {
    if (!draft.trim()) return;
    setTurns([...turns, { kind: 'you', time: 'Now', body: draft }]);
    setDraft('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 'var(--spacing-24)', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-20)', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-16)' }}>
          <Button variant="glass" icon="arrow-right" aria-label="Back" onClick={() => onOpenCircle(null)} style={{ transform: 'scaleX(-1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <DisplayHeadline size="card" align="left" as="h1" style={{ fontSize: 30 }}>{circle.name}</DisplayHeadline>
            <MonoLabel size="tiny" tone="var(--text-muted)">{`Circle of ${circle.members.length} · ${circle.note}`}</MonoLabel>
          </div>
        </div>
        <Panel level="canvas" padding="var(--spacing-24)" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
          {turns.map((t, i) => {
            const a = t.id ? agentById(t.id) : null;
            return (
              <Message key={i} kind={t.kind} author={a ? a.name : t.kind === 'you' ? 'You' : undefined} tone={a?.tone} time={t.time}>
                {t.body}
              </Message>
            );
          })}
        </Panel>
        <PromptInput addressing="To the circle" value={draft} onChange={setDraft} onSubmit={send} placeholder="Say something, or ask an agent to handle it…" />
      </div>
      <Panel level="card" padding="var(--spacing-20)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)', alignSelf: 'start' }}>
        <MonoLabel size="micro" tone="var(--text-body)">Members</MonoLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {circle.members.map((id) => {
            const a = agentById(id);
            return <AgentRow key={id} name={a.name} tone={a.tone} meta={`${a.belongsTo} · ${a.status}`} active={a.status === 'Active'} />;
          })}
          <AgentRow name="You" tone="var(--color-steel)" meta="Owner" />
        </div>
        <Badge variant="quiet" style={{ alignSelf: 'flex-start' }}>Agents may talk here</Badge>
      </Panel>
    </div>
  );
}
