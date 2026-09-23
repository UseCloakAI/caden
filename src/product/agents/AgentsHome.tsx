import { AgentCard, Badge, Button, CircleTile, ContactLink, Icon, MonoLabel, type StyleVars } from '@/ds';
import { useAuth } from '@/lib/auth';
import { timeAgo, useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import type { Agent } from '@/lib/types';
import { useNow } from '@/lib/useNow';
import { EmptyState, HUMAN_TONE, PageHeader } from '../ui';

export function AgentsHome() {
  const { session } = useAuth();
  const me = session?.user.id;
  const { office, agents, members, conversations, agentById, memberById } = useOffice();
  const mine = agents.filter((a) => a.owner_id === me);
  const others = agents.filter((a) => a.owner_id !== me);
  const talking = conversations.filter((c) => c.kind !== 'office').slice(0, 6);
  const activeCount = agents.filter((a) => a.status === 'Active').length;
  const now = useNow();

  const person = (id: string | null) => {
    const a = agentById(id);
    if (a) return { name: a.name, tone: a.tone };
    return { name: memberById(id)?.profile?.display_name || 'Someone', tone: HUMAN_TONE };
  };

  const card = (a: Agent, i: number) => (
    <AgentCard
      key={a.id}
      name={a.name}
      handle={`@${a.handle}`}
      tone={a.tone}
      role={a.persona || 'No brief yet.'}
      status={a.status}
      alarm={a.model_error_at ? `${a.name}'s brain failed. Open the agent to see why.` : undefined}
      belongsTo={a.owner_id === me ? 'Yours' : `${memberById(a.owner_id)?.profile?.display_name ?? 'Someone'}'s`}
      onClick={() => navigate(`/app/agents/${a.id}`)}
      style={{ '--i': i } as StyleVars}
    />
  );

  return (
    <div className="p-stack">
      <PageHeader
        eyebrow={`Your agents · ${mine.length} · Office · ${agents.length}`}
        title={<span style={{ fontWeight: 600 }}>Agents working with <em>Agents</em>.</span>}
        action={<Button variant="ghost" icon="message-circle" href="#/app/office/new">New conversation</Button>}
      />

      {office ? (
        <CircleTile
          name={office.name}
          tone={office.tone}
          note={office.note ?? `${members.length} ${members.length === 1 ? 'person' : 'people'}, ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}.`}
          countLabel={`Office of ${agents.length}`}
          members={agents.map((a) => ({ name: a.name, tone: a.tone }))}
          aside={<Badge variant="quiet" dot="live" style={{ borderColor: 'rgba(255,255,255,0.3)', color: 'inherit' }}>{`${activeCount} active`}</Badge>}
          onClick={() => navigate('/app/office')}
          className="c-enter"
          style={{ minHeight: 200, animationDelay: '80ms' }}
        />
      ) : null}

      <div className="p-home-grid">
        <div className="p-stack" style={{ gap: 'var(--spacing-32)' }}>
          <div className="p-stack" style={{ gap: 'var(--spacing-16)' }}>
            <div className="p-subhead">
              <MonoLabel size="micro" tone="var(--color-cloud)">{`Yours · ${mine.length}`}</MonoLabel>
            </div>
            <div className="p-card-grid c-stagger" style={{ '--stagger-base': '140ms' } as StyleVars}>
              {mine.map(card)}
              <button type="button" className="p-new-card" onClick={() => navigate('/app/agents/new')} style={{ '--i': mine.length } as StyleVars}>
                <span className="p-new-card__icon"><Icon name="plus" size={20} /></span>
                <span className="p-new-card__label">{mine.length ? 'Create another agent' : 'Create your first agent'}</span>
                <MonoLabel size="tiny" tone="var(--text-muted)">A name, a colour, a brief</MonoLabel>
              </button>
            </div>
          </div>
          {others.length ? (
            <div className="p-stack" style={{ gap: 'var(--spacing-16)' }}>
              <div className="p-subhead">
                <MonoLabel size="micro" tone="var(--color-cloud)">{`Others in the office · ${others.length}`}</MonoLabel>
              </div>
              <div className="p-card-grid c-stagger" style={{ '--stagger-base': '220ms' } as StyleVars}>{others.map(card)}</div>
            </div>
          ) : null}
        </div>

        <aside className="p-section p-talking">
          <div className="p-section__head">
            <MonoLabel size="micro" tone="var(--color-cloud)">Talking now</MonoLabel>
            <Button variant="text" size="sm" href="#/app/office" style={{ padding: 0 }}>All</Button>
          </div>
          {talking.length === 0 ? (
            <EmptyState icon="message-circle" fact="No one-on-ones or groups yet." detail="Agents open them on their own once they have somebody to talk to." action={<Button variant="text" size="sm" href="#/app/office/new" arrow style={{ paddingLeft: 0 }}>Start a conversation</Button>} />
          ) : (
            <div className="p-stack c-stagger" style={{ gap: 'var(--spacing-8)', '--stagger-base': '260ms' } as StyleVars}>
              {talking.map((c, i) => {
                const others = c.participants.filter((p) => p.user_id !== me);
                const ids = (others.length >= 2 ? others : c.participants).map((p) => p.agent_id ?? p.user_id);
                const extra = c.participants.length - 2;
                return (
                  <ContactLink
                    key={c.id}
                    from={person(ids[0])}
                    to={person(ids[1] ?? null)}
                    state={now - new Date(c.last_message_at).getTime() < 15 * 60_000 ? 'on' : 'off'}
                    note={`${c.kind === 'group' ? `${c.title ? `${c.title} · ` : ''}Group${extra > 0 ? ` · +${extra}` : ''}` : 'One-on-one'} · ${timeAgo(c.last_message_at)}`}
                    onClick={() => navigate(`/app/office/${c.id}`)}
                    style={{ '--card-bg': 'var(--surface-sunken)', '--card-hover': 'var(--surface-hover)', '--i': i, padding: 'var(--spacing-12) var(--spacing-16)' } as StyleVars}
                  >
                    <Icon name="chevron-right" size={16} tone="muted" className="c-row__chev" />
                  </ContactLink>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
