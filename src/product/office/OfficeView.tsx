import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AgentRow, Badge, Button, DisplayHeadline, Message, MonoLabel, Panel, PromptInput } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { clockTime, timeAgo, useOffice, useThread, type ConversationWithPeople } from '@/lib/office';
import { navigate } from '@/lib/router';
import { EmptyState, ErrorLine, conversationLabel } from '../ui';
import { NewConversation } from './NewConversation';

const HUMAN_TONE = 'var(--color-steel)';

export function OfficeView({ conversationId, composing }: { conversationId?: string; composing: boolean }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const office = useOffice();
  const { conversations, agentById, memberById } = office;
  const officeThread = conversations.find((c) => c.kind === 'office');
  const current = conversations.find((c) => c.id === conversationId) ?? officeThread;
  const label = (c: ConversationWithPeople) => conversationLabel(c, me, agentById, memberById, office.office?.name);

  const groups = conversations.filter((c) => c.kind === 'group');
  const directs = conversations.filter((c) => c.kind === 'direct');

  const row = (c: ConversationWithPeople) => {
    const first = c.participants.find((p) => p.user_id !== me);
    const tone = c.kind === 'office' ? office.office?.tone : first?.agent_id ? agentById(first.agent_id)?.tone : HUMAN_TONE;
    return (
      <AgentRow
        key={c.id}
        name={label(c)}
        tone={tone}
        meta={c.kind === 'office' ? `Everyone · ${timeAgo(c.last_message_at)}` : timeAgo(c.last_message_at)}
        selected={current?.id === c.id}
        onClick={() => navigate(`/app/office/${c.id}`)}
      />
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr) 240px', gap: 'var(--spacing-24)', height: '100%', minHeight: 0 }}>
      <Panel level="sunken" padding="var(--spacing-12)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)', overflowY: 'auto', minHeight: 0 }}>
        <Button variant="ghost" icon="plus" href="#/app/office/new" style={{ justifyContent: 'center' }}>New conversation</Button>
        <Section label="Office">{officeThread ? row(officeThread) : null}</Section>
        <Section label={`Groups · ${groups.length}`}>{groups.map(row)}</Section>
        <Section label={`One-on-ones · ${directs.length}`}>{directs.map(row)}</Section>
      </Panel>

      {current ? <Thread key={current.id} convo={current} label={label(current)} /> : <EmptyState fact="No conversations yet." />}

      {current ? <Members convo={current} /> : <div />}
      {composing ? <NewConversation onClose={() => navigate(current ? `/app/office/${current.id}` : '/app/office')} /> : null}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: '0 var(--spacing-12) var(--spacing-4)' }}>{label}</MonoLabel>
      {children}
    </div>
  );
}

function Thread({ convo, label }: { convo: ConversationWithPeople; label: string }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const { agentById, memberById } = useOffice();
  const { messages, loading } = useThread(convo.id);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    setDraft('');
    const { error: err } = await supabase.from('messages').insert({ conversation_id: convo.id, office_id: convo.office_id, author_user_id: me, kind: 'you', body });
    if (err) {
      setDraft(body);
      setError(errorCopy(err));
    }
  };

  const addressing = convo.kind === 'office' ? 'To the office' : convo.kind === 'group' ? 'To the group' : `To ${label}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)', minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
        <DisplayHeadline size="card" align="left" as="h1" style={{ fontSize: 30 }}>{label}</DisplayHeadline>
        <MonoLabel size="tiny" tone="var(--text-muted)">
          {convo.kind === 'office' ? 'Everyone in the office · @mention an agent for a reply' : `${convo.kind === 'group' ? 'Group' : 'One-on-one'} · ${convo.participants.length} members`}
        </MonoLabel>
      </div>
      <Panel level="canvas" padding="var(--spacing-24)" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        {loading ? <MonoLabel size="tiny" tone="var(--text-muted)">Loading</MonoLabel> : null}
        {!loading && messages.length === 0 ? <EmptyState fact="Nothing said here yet." /> : null}
        {messages.map((m) => {
          if (m.kind === 'system') return <Message key={m.id} kind="system">{m.body}</Message>;
          const agent = agentById(m.author_agent_id);
          const mine = m.author_user_id === me && !m.author_agent_id;
          const human = memberById(m.author_user_id)?.profile?.display_name;
          return (
            <Message
              key={m.id}
              kind={mine ? 'you' : 'agent'}
              author={mine ? 'You' : agent?.name ?? human ?? 'Someone'}
              tone={agent?.tone ?? HUMAN_TONE}
              time={clockTime(m.created_at)}
            >
              {m.body}
            </Message>
          );
        })}
        <ScrollAnchor dep={messages.length} />
      </Panel>
      <ErrorLine>{error}</ErrorLine>
      <PromptInput addressing={addressing} value={draft} onChange={setDraft} onSubmit={send} placeholder="Say something, or @mention an agent…" />
    </div>
  );
}

function ScrollAnchor({ dep }: { dep: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'end' });
  }, [dep]);
  return <div ref={ref} />;
}

function Members({ convo }: { convo: ConversationWithPeople }) {
  const { session } = useAuth();
  const { agents, members, agentById, memberById } = useOffice();
  const agentIds = convo.kind === 'office' ? agents.map((a) => a.id) : convo.participants.flatMap((p) => (p.agent_id ? [p.agent_id] : []));
  const userIds = convo.kind === 'office' ? members.map((m) => m.user_id) : convo.participants.flatMap((p) => (p.user_id ? [p.user_id] : []));
  return (
    <Panel level="card" padding="var(--spacing-20)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)', alignSelf: 'start' }}>
      <MonoLabel size="micro" tone="var(--text-body)">Members</MonoLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {agentIds.map((id) => {
          const a = agentById(id);
          if (!a) return null;
          return (
            <AgentRow
              key={id}
              name={a.name}
              tone={a.tone}
              meta={`@${a.handle} · ${a.status}`}
              active={a.status === 'Active'}
              onClick={() => navigate(`/app/agents/${a.id}`)}
            />
          );
        })}
        {userIds.map((id) => (
          <AgentRow key={id} name={id === session?.user.id ? 'You' : memberById(id)?.profile?.display_name || 'Someone'} tone={HUMAN_TONE} meta="Person" />
        ))}
      </div>
      <Badge variant="quiet" style={{ alignSelf: 'flex-start' }}>{convo.kind === 'office' ? 'Agents reply when mentioned' : 'Agents here reply to each other'}</Badge>
    </Panel>
  );
}
