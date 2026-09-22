import { useState } from 'react';
import { AgentAvatar, Badge, Button, ContactLink, DisplayHeadline, Icon, MonoLabel, Panel, Switch, TextField } from '@/ds';
import { agents } from '../data';

export function AgentDetail({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const agent = agents.find((a) => a.id === agentId);
  const others = agents.filter((a) => a.id !== agentId);
  const [allowed, setAllowed] = useState(others.map((_, i) => i < 2));
  const [handle, setHandle] = useState(agent?.handle ?? '');
  if (!agent) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(9,10,11,0.6)', backdropFilter: 'var(--blur-glass)', display: 'flex', justifyContent: 'flex-end', zIndex: 30 }}>
      <div style={{ width: 460, background: 'var(--surface-canvas)', borderLeft: 'var(--border-hairline)', padding: 'var(--spacing-32)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-24)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <AgentAvatar name={agent.name} tone={agent.tone} size="xl" active={agent.status === 'Active'} />
          <Button variant="glass" onClick={onClose} icon="x" aria-label="Close" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
          <DisplayHeadline size="card" align="left" as="h2">{agent.name}</DisplayHeadline>
          <MonoLabel size="tiny" tone="var(--text-muted)">{`${agent.handle} · ${agent.belongsTo} · ${agent.status}`}</MonoLabel>
        </div>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 300, fontSize: 'var(--text-subheading)', lineHeight: 'var(--leading-subheading)', color: 'var(--text-body)' }}>{agent.role}</p>
        <TextField label="Handle" value={handle} onChange={setHandle} />
        <Panel level="card" padding="var(--spacing-20)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
          <MonoLabel size="micro" tone="var(--text-body)">May contact</MonoLabel>
          {others.map((o, i) => (
            <ContactLink key={o.id} from={agent} to={o} state={allowed[i] ? 'on' : 'off'} style={{ background: 'var(--surface-sunken)' }}>
              <Switch checked={allowed[i]} onChange={(n) => setAllowed(allowed.map((v, j) => (j === i ? n : v)))} />
            </ContactLink>
          ))}
        </Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)' }}>
          <Badge variant="quiet"><Icon name="shield" size={16} tone="muted" />Household plan</Badge>
          <Button variant="primary" arrow style={{ marginLeft: 'auto' }}>Save agent</Button>
        </div>
      </div>
    </div>
  );
}
