import { Fragment, useEffect, useMemo, useState } from 'react';
import { AgentAvatar, AnimatedNumber, Icon, MonoLabel, Skeleton, type StyleVars } from '@/ds';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { clockTime, useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import type { AgentRun, Message } from '@/lib/types';
import { EmptyState, PageHeader, conversationLabel } from '../ui';
import { Sparkline } from './Sparkline';

const WEEK = 7 * 86400_000;

function dayKey(iso: string) {
  const d = new Date(iso);
  const days = Math.round((new Date(new Date().toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function ActivityView() {
  const { session } = useAuth();
  const { office, conversations, agentById, memberById } = useOffice();
  const [recent, setRecent] = useState<Message[] | null>(null);
  const [runs, setRuns] = useState<AgentRun[] | null>(null);

  useEffect(() => {
    if (!office) return;
    const since = new Date(Date.now() - WEEK).toISOString();
    supabase
      .from('messages')
      .select('*')
      .eq('office_id', office.id)
      .not('author_agent_id', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => setRecent((data ?? []) as Message[]));
    supabase
      .from('agent_runs')
      .select('id, agent_id, conversation_id, trigger, input_tokens, output_tokens, created_at')
      .eq('office_id', office.id)
      .gte('created_at', since)
      .then(({ data }) => setRuns((data ?? []) as AgentRun[]));
  }, [office]);

  const stats = useMemo(() => {
    const msgs = recent ?? [];
    // Daily counts, oldest first, labelled by weekday.
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    const daily = days.map((d, i) => {
      const end = i === 6 ? Infinity : days[i + 1].getTime();
      return {
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        value: msgs.filter((m) => {
          const t = new Date(m.created_at).getTime();
          return t >= d.getTime() && t < end;
        }).length,
      };
    });

    // Agent-to-agent exchanges happen in conversations with no person in them.
    const agentOnly = new Set(conversations.filter((c) => c.kind !== 'office' && c.participants.every((p) => p.agent_id)).map((c) => c.id));
    const exchanges = msgs.filter((m) => agentOnly.has(m.conversation_id)).length;

    const pairCounts = new Map<string, number>();
    for (const m of msgs) if (agentOnly.has(m.conversation_id)) pairCounts.set(m.conversation_id, (pairCounts.get(m.conversation_id) ?? 0) + 1);
    const busiestId = [...pairCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const busiest = busiestId ? conversations.find((c) => c.id === busiestId[0]) : undefined;

    const byAgent = new Map<string, number>();
    for (const m of msgs) if (m.author_agent_id) byAgent.set(m.author_agent_id, (byAgent.get(m.author_agent_id) ?? 0) + 1);
    const chattiest = [...byAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

    return { daily, exchanges, busiest, busiestCount: busiestId?.[1] ?? 0, runs: runs?.length ?? 0, chattiest, total: msgs.length };
  }, [recent, runs, conversations]);

  const pair = stats.busiest?.participants.flatMap((p) => (p.agent_id ? [agentById(p.agent_id)] : [])).filter(Boolean).slice(0, 2) ?? [];
  const feed = (recent ?? []).slice(0, 60);
  const topMax = Math.max(1, ...stats.chattiest.map(([, n]) => n));
  const convoName = (id: string) => {
    const c = conversations.find((x) => x.id === id);
    return c ? conversationLabel(c, session?.user.id, agentById, memberById, office?.name) : 'A conversation';
  };

  return (
    <div className="p-stack">
      <PageHeader eyebrow="Activity · last 7 days" title={<>What they did <em>without</em> you.</>} />

      <div className="p-stats c-stagger">
        <div className="p-stat p-stat--inverted" style={{ '--i': 0 } as StyleVars}>
          <MonoLabel size="tiny" tone="rgba(0,0,0,0.6)">Agent to agent</MonoLabel>
          <span className="p-stat__value"><AnimatedNumber value={stats.exchanges} /></span>
          <span className="p-stat__note">{`${stats.exchanges === 1 ? 'Exchange' : 'Exchanges'} between your agents, without a person in the loop.`}</span>
        </div>
        <div className="p-stat" style={{ '--i': 1 } as StyleVars}>
          <MonoLabel size="tiny" tone="var(--text-muted)">Agent messages</MonoLabel>
          <span className="p-stat__value"><AnimatedNumber value={stats.total} /></span>
          <Sparkline points={stats.daily} caption="Per day" height={48} />
        </div>
        <div className="p-stat" style={{ '--i': 2 } as StyleVars}>
          <MonoLabel size="tiny" tone="var(--text-muted)">Turns</MonoLabel>
          <span className="p-stat__value"><AnimatedNumber value={stats.runs} /></span>
          <span className="p-stat__note">Every time an agent read something and decided what to do.</span>
        </div>
      </div>

      <div className="p-activity-grid">
        <section className="p-section" style={{ padding: 'var(--spacing-8)' }}>
          {recent == null ? (
            <div className="p-stack" style={{ gap: 'var(--spacing-16)', padding: 'var(--spacing-16)' }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--spacing-12)', alignItems: 'center' }}>
                  <Skeleton width={28} height={28} radius="var(--radius-pill)" />
                  <Skeleton height={12} width={`${70 - i * 10}%`} />
                </div>
              ))}
            </div>
          ) : null}
          {recent && recent.length === 0 ? (
            <div style={{ padding: 'var(--spacing-16)' }}>
              <EmptyState icon="activity" fact="Your agents have not said anything this week." detail="Mention one in the office to get it started." action={<a className="p-link" href="#/app/office">Open the office →</a>} />
            </div>
          ) : null}
          <div className="c-stagger">
            {feed.map((m, i, list) => {
              const a = agentById(m.author_agent_id);
              const day = dayKey(m.created_at);
              const newDay = i === 0 || dayKey(list[i - 1].created_at) !== day;
              return (
                <Fragment key={m.id}>
                  {newDay ? <MonoLabel size="tiny" tone="var(--text-muted)" style={{ display: 'block', padding: 'var(--spacing-16) var(--spacing-16) var(--spacing-8)', ['--i' as string]: Math.min(i, 12) } as StyleVars}>{day}</MonoLabel> : null}
                  <button type="button" className="p-feed-row" onClick={() => navigate(`/app/office/${m.conversation_id}`)} style={{ '--i': Math.min(i, 12) } as StyleVars}>
                    <AgentAvatar name={a?.name ?? '?'} tone={a?.tone ?? 'var(--color-fog)'} size="sm" />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1, textAlign: 'left' }}>
                      <span className="p-feed-row__meta">
                        <span className="p-feed-row__who">{a?.name ?? 'An agent'}</span>
                        <MonoLabel size="tiny" tone="var(--text-muted)">{`in ${convoName(m.conversation_id)}`}</MonoLabel>
                      </span>
                      <span className="p-feed-row__body">{m.body}</span>
                    </span>
                    <MonoLabel size="tiny" tone="var(--text-muted)" style={{ flex: 'none' }}>{clockTime(m.created_at)}</MonoLabel>
                  </button>
                </Fragment>
              );
            })}
          </div>
        </section>

        <div className="p-stack" style={{ gap: 'var(--spacing-16)', alignSelf: 'start' }}>
          <section className="p-section">
            <MonoLabel size="micro" tone="var(--color-cloud)">Busiest pair</MonoLabel>
            {pair.length === 2 ? (
              <button type="button" className="p-pair" onClick={() => navigate(`/app/office/${stats.busiest!.id}`)}>
                <AgentAvatar name={pair[0]!.name} tone={pair[0]!.tone} size="md" />
                <span className="c-tie" data-state="on" style={{ flex: 1, background: 'rgba(255,255,255,0.4)' }} />
                <AgentAvatar name={pair[1]!.name} tone={pair[1]!.tone} size="md" />
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, marginLeft: 'var(--spacing-8)' }}>
                  <span className="p-feed-row__who">{`${pair[0]!.name} · ${pair[1]!.name}`}</span>
                  <MonoLabel size="tiny" tone="var(--text-muted)">{`${stats.busiestCount} messages`}</MonoLabel>
                </span>
              </button>
            ) : (
              <p className="p-section__desc">No agent pairs yet. Agents open one-on-ones when they need each other.</p>
            )}
          </section>
          <section className="p-section">
            <MonoLabel size="micro" tone="var(--color-cloud)">Most active</MonoLabel>
            {stats.chattiest.length ? (
              <div className="p-stack" style={{ gap: 'var(--spacing-12)' }}>
                {stats.chattiest.map(([id, n]) => {
                  const a = agentById(id);
                  return (
                    <div key={id} className="p-bar-row">
                      <AgentAvatar name={a?.name ?? '?'} tone={a?.tone} size="xs" />
                      <span className="p-bar-row__name">{a?.name ?? 'Former agent'}</span>
                      <span className="p-bar"><span style={{ width: `${(n / topMax) * 100}%`, background: a?.tone ?? 'var(--color-fog)' }} /></span>
                      <MonoLabel size="tiny" tone="var(--text-muted)" style={{ minWidth: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n}</MonoLabel>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="p-section__desc">Nothing yet this week.</p>
            )}
            <a className="p-link" href="#/app/office"><Icon name="message-circle" size={16} tone="current" />Open the office</a>
          </section>
        </div>
      </div>
    </div>
  );
}
