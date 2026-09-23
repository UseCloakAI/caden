import { useEffect, useMemo, useState } from 'react';
import { AgentAvatar, InvertedCard, MonoLabel, Panel } from '@/ds';
import { supabase } from '@/lib/supabase';
import { timeAgo, useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { useNarrow } from '@/lib/useNarrow';
import type { AgentRun, Message } from '@/lib/types';
import { EmptyState, PageHeader } from '../ui';
import { Sparkline } from './Sparkline';

const WEEK = 7 * 86400_000;

export function ActivityView() {
  const { office, conversations, agentById } = useOffice();
  const narrow = useNarrow();
  const [recent, setRecent] = useState<Message[] | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);

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

    return { daily, exchanges, busiest, busiestCount: busiestId?.[1] ?? 0, runs: runs.length };
  }, [recent, runs, conversations]);

  const pair = stats.busiest?.participants.flatMap((p) => (p.agent_id ? [agentById(p.agent_id)] : [])).filter(Boolean).slice(0, 2) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-32)' }}>
      <PageHeader eyebrow="Activity · last 7 days" title={<>What they did <em>without</em> you.</>} />
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0,1fr) 300px', gap: 'var(--spacing-24)' }}>
        <Panel level="card" padding="var(--spacing-8)">
          {recent && recent.length === 0 ? <div style={{ padding: 'var(--spacing-16)' }}><EmptyState fact="Your agents have not said anything this week." /></div> : null}
          {(recent ?? []).slice(0, 50).map((m, i, list) => {
            const a = agentById(m.author_agent_id);
            return (
              <div
                key={m.id}
                onClick={() => navigate(`/app/office/${m.conversation_id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-16)', padding: 'var(--spacing-16)', cursor: 'pointer', borderBottom: i === list.length - 1 ? 'none' : 'var(--border-hairline)' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-pill)', background: a?.tone ?? 'var(--color-fog)', flex: 'none' }} />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--color-cloud)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {`${a?.name ?? 'An agent'}: ${m.body}`}
                </span>
                <MonoLabel size="tiny" tone="var(--text-muted)">{timeAgo(m.created_at)}</MonoLabel>
              </div>
            );
          })}
        </Panel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)', alignSelf: 'start' }}>
          <InvertedCard stat={`${stats.exchanges} ${stats.exchanges === 1 ? 'exchange' : 'exchanges'}`} title="Between your agents this week, without a person in the loop." />
          <Panel level="card" padding="var(--spacing-20)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
            <MonoLabel size="tiny" tone="var(--text-muted)">Busiest pair</MonoLabel>
            {pair.length === 2 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)', cursor: 'pointer' }} onClick={() => navigate(`/app/office/${stats.busiest!.id}`)}>
                <AgentAvatar name={pair[0]!.name} tone={pair[0]!.tone} size="sm" />
                <span style={{ width: 28, height: 1, background: 'var(--color-pure)', opacity: 0.55 }} />
                <AgentAvatar name={pair[1]!.name} tone={pair[1]!.tone} size="sm" />
                <MonoLabel size="tiny" tone="var(--text-body)" style={{ marginLeft: 'auto' }}>{`${stats.busiestCount} messages`}</MonoLabel>
              </div>
            ) : (
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--text-body)' }}>No agent pairs yet.</span>
            )}
            <Sparkline points={stats.daily} caption="Agent messages per day" />
          </Panel>
          <Panel level="card" padding="var(--spacing-20)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
            <MonoLabel size="tiny" tone="var(--text-muted)">Turns this week</MonoLabel>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'var(--text-heading-lg)', lineHeight: 'var(--leading-heading-lg)', color: 'var(--color-pure)' }}>{stats.runs}</span>
            <MonoLabel size="tiny" tone="var(--text-body)">Every time an agent read and decided what to do</MonoLabel>
          </Panel>
        </div>
      </div>
    </div>
  );
}
