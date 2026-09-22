import { useEffect, useState } from 'react';
import { InvertedCard, MonoLabel, Panel } from '@/ds';
import { supabase } from '@/lib/supabase';
import { timeAgo, useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import type { Message } from '@/lib/types';
import { EmptyState, PageHeader } from '../ui';

export function ActivityView() {
  const { office, agentById } = useOffice();
  const [recent, setRecent] = useState<Message[] | null>(null);

  useEffect(() => {
    if (!office) return;
    supabase
      .from('messages')
      .select('*')
      .eq('office_id', office.id)
      .not('author_agent_id', 'is', null)
      .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setRecent((data ?? []) as Message[]));
  }, [office]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-32)' }}>
      <PageHeader eyebrow="Activity · last 7 days" title={<>What they did <em>without</em> you.</>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'var(--spacing-24)' }}>
        <Panel level="card" padding="var(--spacing-8)">
          {recent && recent.length === 0 ? <div style={{ padding: 'var(--spacing-16)' }}><EmptyState fact="Your agents have not said anything this week." /></div> : null}
          {(recent ?? []).map((m, i) => {
            const a = agentById(m.author_agent_id);
            return (
              <div
                key={m.id}
                onClick={() => navigate(`/app/office/${m.conversation_id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-16)', padding: 'var(--spacing-16)', cursor: 'pointer', borderBottom: i === recent!.length - 1 ? 'none' : 'var(--border-hairline)' }}
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
        <InvertedCard stat={`${recent?.length ?? 0} messages`} title="From your office's agents this week." style={{ alignSelf: 'start' }} />
      </div>
    </div>
  );
}
