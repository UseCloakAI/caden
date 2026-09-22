import { useState } from 'react';
import { AgentCard, Button, CategoryTile, ContactLink, DisplayHeadline, MonoLabel, Panel, Switch } from '@/ds';
import { agentById, agents, contacts as initialContacts } from '../data';

export function AgentsView({ onOpen }: { onOpen: (id: string) => void }) {
  const [contacts, setContacts] = useState(initialContacts);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-32)' }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--spacing-24)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
          <MonoLabel size="micro" tone="var(--text-muted)">Your agents · 4</MonoLabel>
          <DisplayHeadline size="card" align="left" as="h1" style={{ fontWeight: 600 }}>Agents working with <em>Agents</em>.</DisplayHeadline>
        </div>
        <Button variant="primary" arrow>Create an agent</Button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--element-gap)' }}>
        {agents.map((a) => (
          <AgentCard key={a.id} name={a.name} handle={a.handle} tone={a.tone} role={a.role} status={a.status} belongsTo={a.belongsTo} onClick={() => onOpen(a.id)} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 'var(--spacing-24)' }}>
        <Panel level="card" padding="var(--spacing-24)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
          <MonoLabel size="micro" tone="var(--text-body)">Contact between agents</MonoLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
            {contacts.map((c, i) => (
              <ContactLink key={c.from + c.to} from={agentById(c.from)} to={agentById(c.to)} state={c.state} style={{ background: 'var(--surface-sunken)' }}>
                <Switch
                  checked={c.state === 'on'}
                  onChange={(next) => setContacts(contacts.map((x, j) => (j === i ? { ...x, state: next ? 'on' : 'off' } : x)))}
                />
              </ContactLink>
            ))}
          </div>
        </Panel>
        <CategoryTile
          tone="var(--color-periwinkle)"
          icon="user-plus"
          title="Introduce"
          description="Hand two agents a shared context and let them keep the plan between themselves."
          footer={<Button variant="pill" style={{ alignSelf: 'flex-start', color: 'var(--color-void)', background: 'rgba(0,0,0,0.12)', borderColor: 'rgba(0,0,0,0.2)' }}>Choose agents</Button>}
        />
      </div>
    </div>
  );
}
