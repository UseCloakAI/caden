import { AgentCard, Button, CircleTile, ContactLink, MonoLabel, Panel } from '@/ds';
import { useAuth } from '@/lib/auth';
import { timeAgo, useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { EmptyState, PageHeader } from '../ui';

const HUMAN_TONE = 'var(--color-steel)';

export function AgentsHome() {
  const { session } = useAuth();
  const me = session?.user.id;
  const { office, agents, members, conversations, agentById, memberById } = useOffice();
  const mine = agents.filter((a) => a.owner_id === me);
  const talking = conversations.filter((c) => c.kind !== 'office').slice(0, 6);

  const person = (id: string | null) => {
    const a = agentById(id);
    if (a) return { name: a.name, tone: a.tone };
    return { name: memberById(id)?.profile?.display_name || 'Someone', tone: HUMAN_TONE };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-32)' }}>
      <PageHeader
        eyebrow={`Your agents · ${mine.length} · Office · ${agents.length}`}
        title={<span style={{ fontWeight: 600 }}>Agents working with <em>Agents</em>.</span>}
        action={<Button variant="primary" arrow href="#/app/agents/new">Create an agent</Button>}
      />

      {office ? (
        <CircleTile
          name={office.name}
          tone={office.tone}
          note={office.note ?? `${members.length} ${members.length === 1 ? 'person' : 'people'}, ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}.`}
          countLabel={`Office of ${agents.length}`}
          members={agents.slice(0, 10).map((a) => ({ name: a.name, tone: a.tone }))}
          onClick={() => navigate('/app/office')}
          style={{ minHeight: 180 }}
        />
      ) : null}

      {agents.length === 0 ? (
        <EmptyState fact="No agents in this office yet." action={<Button variant="text" href="#/app/agents/new" arrow>Create an agent</Button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--element-gap)' }}>
          {agents.map((a) => (
            <AgentCard
              key={a.id}
              name={a.name}
              handle={`@${a.handle}`}
              tone={a.tone}
              role={a.persona || undefined}
              status={a.status}
              belongsTo={a.owner_id === me ? 'Yours' : `${memberById(a.owner_id)?.profile?.display_name ?? 'Someone'}'s`}
              onClick={() => navigate(`/app/agents/${a.id}`)}
            />
          ))}
        </div>
      )}

      <Panel level="card" padding="var(--spacing-24)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        <MonoLabel size="micro" tone="var(--text-body)">Talking now</MonoLabel>
        {talking.length === 0 ? (
          <EmptyState fact="No one-on-ones or groups yet." action={<Button variant="text" href="#/app/office" arrow>Start a conversation</Button>} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
            {talking.map((c) => {
              const others = c.participants.filter((p) => p.user_id !== me);
              const ids = (others.length >= 2 ? others : c.participants).map((p) => p.agent_id ?? p.user_id);
              const extra = c.participants.length - 2;
              return (
                <ContactLink
                  key={c.id}
                  from={person(ids[0])}
                  to={person(ids[1] ?? null)}
                  note={`${c.kind === 'group' ? `Group${extra > 0 ? ` · +${extra}` : ''}` : 'One-on-one'} · ${timeAgo(c.last_message_at)}`}
                  onClick={() => navigate(`/app/office/${c.id}`)}
                  style={{ background: 'var(--surface-sunken)', cursor: 'pointer' }}
                />
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
