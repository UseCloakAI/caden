import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AgentRow, AvatarStack, Badge, Button, Icon, Message, MonoLabel, Skeleton, TypingIndicator, cx, useMedia, type StyleVars } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { clockTime, timeAgo, useOffice, useThread, type ConversationWithPeople } from '@/lib/office';
import { navigate } from '@/lib/router';
import { useNarrow } from '@/lib/useNarrow';
import { useNow } from '@/lib/useNow';
import { activityLabel, useAgentActivity } from '@/lib/activity';
import type { Agent, Message as Msg } from '@/lib/types';
import { EmptyState, ErrorLine, HUMAN_TONE, conversationFaces, conversationLabel } from '../ui';
import { NewConversation } from './NewConversation';
import { ReactionBar } from './ReactionBar';
import { Composer } from './Composer';

const MEMBERS_KEY = 'caden.members-open';

export function OfficeView({ conversationId, composing }: { conversationId?: string; composing: boolean }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const office = useOffice();
  const { conversations, agentById, memberById } = office;
  const officeThread = conversations.find((c) => c.kind === 'office');
  const current = conversations.find((c) => c.id === conversationId) ?? officeThread;
  const label = (c: ConversationWithPeople) => conversationLabel(c, me, agentById, memberById, office.office?.name);
  const narrow = useNarrow();
  const wide = useMedia('(min-width: 80em)');
  const [membersOpen, setMembersOpen] = useState(() => {
    try {
      return localStorage.getItem(MEMBERS_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const toggleMembers = () => {
    setMembersOpen((v) => {
      try {
        localStorage.setItem(MEMBERS_KEY, v ? '0' : '1');
      } catch {
        /* storage blocked: keep it for this visit only */
      }
      return !v;
    });
  };
  const [query, setQuery] = useState('');
  const now = useNow();
  const closeComposer = () => navigate(current ? `/app/office/${current.id}` : '/app/office');

  const groups = conversations.filter((c) => c.kind === 'group');
  const directs = conversations.filter((c) => c.kind === 'direct');
  const match = (c: ConversationWithPeople) => !query.trim() || label(c).toLowerCase().includes(query.trim().toLowerCase());

  const row = (c: ConversationWithPeople) => {
    const faces = conversationFaces(c, me, agentById, memberById);
    const tone = c.kind === 'office' ? office.office?.tone : faces[0]?.tone ?? HUMAN_TONE;
    const fresh = now - new Date(c.last_message_at).getTime() < 5 * 60_000;
    return (
      <AgentRow
        key={c.id}
        name={label(c)}
        tone={tone}
        leading={c.kind === 'group' && faces.length > 1 ? <AvatarStack people={faces} size="xs" max={3} ring="var(--surface-sunken)" style={{ flex: 'none' }} /> : undefined}
        meta={c.kind === 'office' ? `Everyone · ${timeAgo(c.last_message_at)}` : timeAgo(c.last_message_at)}
        selected={current?.id === c.id}
        trailing={fresh && current?.id !== c.id ? <span className="c-dot" data-live style={{ '--dot': 'var(--data-signal)' } as StyleVars} /> : null}
        onClick={() => navigate(`/app/office/${c.id}`)}
      />
    );
  };

  const showMembers = membersOpen && wide;

  if (narrow) {
    return (
      <div className="p-office p-office--narrow">
        <div className="p-convo-pills">
          <Button variant="pill" size="sm" icon="plus" href="#/app/office/new" aria-label="New conversation" />
          {conversations.map((c) => (
            <Button key={c.id} variant="pill" size="sm" pressed={current?.id === c.id} onClick={() => navigate(`/app/office/${c.id}`)}>
              {label(c)}
            </Button>
          ))}
        </div>
        {current ? <Thread key={current.id} convo={current} label={label(current)} /> : <EmptyState icon="message-circle" fact="No conversations yet." action={<Button variant="text" href="#/app/office/new" arrow>Start one</Button>} />}
        {composing ? <NewConversation onClose={closeComposer} /> : null}
      </div>
    );
  }

  return (
    <div className="p-office" data-members={showMembers || undefined}>
      <aside className="p-convos">
        <div className="p-convos__head">
          <MonoLabel size="micro" tone="var(--color-cloud)">Conversations</MonoLabel>
          <Button variant="glass" size="sm" icon="plus" href="#/app/office/new" aria-label="New conversation" title="New conversation" />
        </div>
        <label className="p-search">
          <Icon name="search" size={16} tone="muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a conversation" aria-label="Find a conversation" />
        </label>
        <div className="p-convos__list">
          {officeThread && match(officeThread) ? <ListSection label="Office">{row(officeThread)}</ListSection> : null}
          <ListSection label={`Groups · ${groups.length}`}>{groups.filter(match).map(row)}</ListSection>
          <ListSection label={`One-on-ones · ${directs.length}`}>{directs.filter(match).map(row)}</ListSection>
        </div>
      </aside>

      {current ? (
        <Thread key={current.id} convo={current} label={label(current)} membersOpen={showMembers} onToggleMembers={wide ? toggleMembers : undefined} />
      ) : (
        <div className="p-thread"><EmptyState icon="message-circle" fact="No conversations yet." action={<Button variant="text" href="#/app/office/new" arrow>Start one</Button>} /></div>
      )}

      {current && showMembers ? <Members key={`members-${current.id}`} convo={current} /> : null}
      {composing ? <NewConversation onClose={closeComposer} /> : null}
    </div>
  );
}

function ListSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: 'var(--spacing-12) var(--spacing-12) var(--spacing-4)' }}>{label}</MonoLabel>
      {children}
    </div>
  );
}

/** Mirrors the server's reader choice (supabase/functions/_shared/agent.ts › pickResponders). */
function readersFor(body: string, convo: ConversationWithPeople, agents: Agent[]) {
  const active = (a: Agent | undefined): a is Agent => !!a && a.status !== 'Paused';
  const mentioned = new Map<string, Agent>();
  for (const [, raw] of body.matchAll(/@([a-z0-9][a-z0-9._]*[a-z0-9]|[a-z0-9])/gi)) {
    const token = raw.toLowerCase();
    const a = agents.find((x) => x.handle === token || x.handle.startsWith(`${token}.`) || x.name.toLowerCase() === token);
    if (active(a)) mentioned.set(a.id, a);
  }
  const named = [...mentioned.values()];
  const inConvo = convo.participants.flatMap((p) => (p.agent_id ? [agents.find((a) => a.id === p.agent_id)] : [])).filter(active);
  if (convo.kind === 'office') return (named.length ? named : agents.filter(active)).slice(0, 6);
  if (convo.kind === 'direct') return inConvo;
  const ordered = [...named.filter((a) => inConvo.some((b) => b.id === a.id)), ...inConvo];
  return [...new Map(ordered.map((a) => [a.id, a])).values()].slice(0, 5);
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Maya is reading", "Maya and Zeph are reading", "Maya, Zeph and 3 more are reading". */
function readingLabel(readers: Agent[]) {
  const names = readers.map((r) => r.name);
  if (names.length === 1) return `${names[0]} is reading`;
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are reading`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more are reading`;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Numbered source chips under an agent's answer, one per site it read. */
function Sources({ sources }: { sources: NonNullable<Msg['sources']> }) {
  return (
    <span className="p-sources" aria-label="Sources">
      {sources.map((s, i) => (
        <a key={s.url} className="p-source" href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
          <span className="p-source__n">{i + 1}</span>
          <span className="p-source__host">{hostOf(s.url)}</span>
        </a>
      ))}
    </span>
  );
}

const authorKey = (m: Msg) => m.author_agent_id ?? m.author_user_id ?? 'system';

function Thread({ convo, label, membersOpen, onToggleMembers }: { convo: ConversationWithPeople; label: string; membersOpen?: boolean; onToggleMembers?: () => void }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const { office, agents, agentById, memberById } = useOffice();
  const { messages, reactions, loading, live, applyLocal } = useThread(convo.id);
  const activity = useAgentActivity(office?.id);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Who should be reading your last message, and since when. Replies and reactions clear them. */
  const [asked, setAsked] = useState<{ agents: Agent[]; since: string } | null>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [seen, setSeen] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  const faces = conversationFaces(convo, me, agentById, memberById);
  const mentionPattern = useMemo(() => {
    const words = agents.flatMap((a) => [a.handle, a.handle.split('.')[0], a.name.toLowerCase()]).sort((x, y) => y.length - x.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return words.length ? new RegExp(`(@(?:${words.join('|')})\\b)`, 'gi') : null;
  }, [agents]);
  const renderBody = (body: string) => (mentionPattern ? body.split(mentionPattern).map((part, i) => (i % 2 ? <span key={i} className="c-mention">{part}</span> : part)) : body);

  const readers = asked
    ? asked.agents.filter(
        (a) =>
          !messages.some((m) => m.author_agent_id === a.id && m.created_at > asked.since) &&
          !reactions.some((r) => r.agent_id === a.id && r.created_at > asked.since),
      )
    : [];
  // What the server says each agent is doing in this thread, then the client's guess for anyone
  // it hasn't picked up yet ("reading" in the ~1.5s before a turn starts).
  const working = [...activity.values()]
    .filter((r) => r.conversation_id === convo.id)
    .flatMap((r) => {
      const a = agentById(r.agent_id);
      return a ? [{ agent: a, label: `${a.name} is ${activityLabel(r)}` }] : [];
    });
  const waiting = readers.filter((a) => !activity.has(a.id));
  const indicators = working.length + (waiting.length ? 1 : 0);
  const unseen = atEnd ? 0 : Math.max(0, messages.length - seen);

  const scrollToEnd = useCallback((smooth: boolean) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // First paint jumps to the end; after that, follow along only if you were already there.
  const count = messages.length;
  const lastMine = messages[count - 1]?.author_user_id === me;
  const landed = useRef(false);
  useLayoutEffect(() => {
    if (loading) return;
    if (!landed.current) {
      landed.current = true;
      scrollToEnd(false);
    } else if (atEnd || lastMine) scrollToEnd(true);
  }, [count, loading, lastMine, atEnd, scrollToEnd]);
  useEffect(() => {
    if (indicators && atEnd) scrollToEnd(true);
  }, [indicators, atEnd, scrollToEnd]);

  // Nobody replies to everything; stop showing "reading" after half a minute.
  useEffect(() => {
    if (!asked) return;
    const t = setTimeout(() => setAsked(null), 30_000);
    return () => clearTimeout(t);
  }, [asked]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    setDraft('');
    const { data, error: err } = await supabase
      .from('messages')
      .insert({ conversation_id: convo.id, office_id: convo.office_id, author_user_id: me, kind: 'you', body })
      .select('created_at')
      .single();
    if (err) {
      setDraft(body);
      setError(errorCopy(err));
    } else setAsked({ agents: readersFor(body, convo, agents), since: data.created_at });
  };

  const addressing = convo.kind === 'office' ? 'To the office' : convo.kind === 'group' ? 'To the group' : `To ${label}`;
  const meta = convo.kind === 'office' ? 'Everyone · @mention an agent for a reply' : `${convo.kind === 'group' ? 'Group' : 'One-on-one'} · ${convo.participants.length} members`;

  return (
    <section className="p-thread" aria-label={label}>
      <header className="p-thread__head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', minWidth: 0 }}>
          <h1 className="p-thread__title">{label}</h1>
          <MonoLabel size="tiny" tone="var(--text-muted)">{meta}</MonoLabel>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)' }}>
          {faces.length ? <AvatarStack people={faces} size="xs" max={5} ring="var(--surface-canvas)" /> : null}
          {onToggleMembers ? <Button variant="glass" size="sm" icon="panel-right" pressed={membersOpen} onClick={onToggleMembers} aria-label={membersOpen ? 'Hide members' : 'Show members'} title="Members" /> : null}
        </div>
      </header>
      <div
        ref={scroller}
        className="p-thread__scroll"
        onScroll={(e) => {
          const el = e.currentTarget;
          const end = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          setAtEnd(end);
          if (end) setSeen(count);
        }}
      >
        <div className="p-thread__stack">
          {loading ? <ThreadSkeleton /> : null}
          {!loading && messages.length === 0 ? (
            <EmptyState
              icon="message-circle"
              fact="Nothing said here yet."
              detail={convo.kind === 'office' ? 'Post to everyone, or @mention one agent to ask it directly.' : 'Say something. The agents here read every message.'}
            />
          ) : null}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const animate = live.has(m.id);
            const day = newDay ? (
              <div className="p-day" role="separator"><MonoLabel size="tiny" tone="var(--text-muted)">{dayLabel(m.created_at)}</MonoLabel></div>
            ) : null;
            if (m.kind === 'system') return <Fragment key={m.id}>{day}<Message kind="system" animate={animate}>{m.body}</Message></Fragment>;
            const agent = agentById(m.author_agent_id);
            const mine = m.author_user_id === me && !m.author_agent_id;
            const human = memberById(m.author_user_id)?.profile?.display_name;
            const grouped = !newDay && prev?.kind !== 'system' && authorKey(prev) === authorKey(m) && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
            return (
              <Fragment key={m.id}>
                {day}
                <Message
                  kind={mine ? 'you' : 'agent'}
                  author={mine ? 'You' : agent?.name ?? human ?? 'Someone'}
                  tone={agent?.tone ?? HUMAN_TONE}
                  time={clockTime(m.created_at)}
                  grouped={grouped}
                  animate={animate}
                  className="p-msg"
                  footer={<ReactionBar messageId={m.id} reactions={reactions} me={me} onLocal={applyLocal} onError={setError} align={mine ? 'end' : 'start'} />}
                >
                  {renderBody(m.body)}
                  {m.sources?.length ? <Sources sources={m.sources} /> : null}
                </Message>
              </Fragment>
            );
          })}
          {working.map((w) => (
            <TypingIndicator key={`${w.agent.id}:${w.label}`} author={w.agent.name} tone={w.agent.tone} label={w.label} />
          ))}
          {waiting.length ? <TypingIndicator key={waiting.map((r) => r.id).join()} author={waiting[0].name} tone={waiting[0].tone} label={readingLabel(waiting)} /> : null}
        </div>
      </div>
      {unseen > 0 ? (
        <button type="button" className="p-jump" onClick={() => scrollToEnd(true)}>
          <Icon name="arrow-down" size={14} tone="dark" />
          {`${unseen} new`}
        </button>
      ) : null}
      <div className="p-thread__composer">
        <ErrorLine>{error}</ErrorLine>
        <Composer agents={agents} addressing={addressing} value={draft} onChange={setDraft} onSend={send} />
      </div>
    </section>
  );
}

function ThreadSkeleton() {
  return (
    <div className="p-stack" style={{ gap: 'var(--spacing-20)' }} aria-hidden="true">
      {[62, 44, 70].map((w, i) => (
        <div key={i} style={{ display: 'flex', gap: 'var(--spacing-12)', flexDirection: i === 1 ? 'row-reverse' : 'row' }}>
          {i === 1 ? null : <Skeleton width={28} height={28} radius="var(--radius-pill)" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)', width: `${w}%`, alignItems: i === 1 ? 'flex-end' : 'flex-start' }}>
            <Skeleton width={80} height={10} />
            <Skeleton height={44} radius="var(--radius-md)" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Members({ convo }: { convo: ConversationWithPeople }) {
  const { session } = useAuth();
  const { office, agents, members, agentById, memberById } = useOffice();
  const activity = useAgentActivity(office?.id);
  const agentIds = convo.kind === 'office' ? agents.map((a) => a.id) : convo.participants.flatMap((p) => (p.agent_id ? [p.agent_id] : []));
  const userIds = convo.kind === 'office' ? members.map((m) => m.user_id) : convo.participants.flatMap((p) => (p.user_id ? [p.user_id] : []));
  return (
    <aside className={cx('p-members', 'c-enter')}>
      <MonoLabel size="micro" tone="var(--color-cloud)" style={{ padding: '0 var(--spacing-12)' }}>{`Members · ${agentIds.length + userIds.length}`}</MonoLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: 'var(--spacing-12) var(--spacing-12) var(--spacing-4)' }}>Agents</MonoLabel>
        {agentIds.map((id) => {
          const a = agentById(id);
          if (!a) return null;
          return (
            <AgentRow
              key={id}
              name={a.name}
              tone={a.tone}
              meta={activity.get(a.id) ? activityLabel(activity.get(a.id)!) : `@${a.handle}`}
              trailing={a.model_error_at ? <span className="c-alarm" role="img" aria-label="Brain error" title="Brain error" /> : a.status === 'Paused' ? <MonoLabel size="tiny" tone="var(--text-muted)">Paused</MonoLabel> : <span className="c-dot" data-live style={{ '--dot': a.tone } as StyleVars} />}
              onClick={() => navigate(`/app/agents/${a.id}`)}
            />
          );
        })}
        <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: 'var(--spacing-16) var(--spacing-12) var(--spacing-4)' }}>People</MonoLabel>
        {userIds.map((id) => (
          <AgentRow key={id} name={id === session?.user.id ? 'You' : memberById(id)?.profile?.display_name || 'Someone'} tone={HUMAN_TONE} meta="Person" />
        ))}
      </div>
      <Badge variant="quiet" style={{ alignSelf: 'flex-start', margin: 'var(--spacing-8) var(--spacing-12) 0', whiteSpace: 'normal', lineHeight: 1.4 }}>
        {convo.kind === 'office' ? 'Mention one agent, or post to all' : 'Agents here read every message'}
      </Badge>
    </aside>
  );
}
