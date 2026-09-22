import { AgentAvatar, MonoLabel, Panel } from '@/ds';
import { activity } from './data';

export function ActivityList({ padding, radius, rowPadding, gap }: { padding: string; radius?: string; rowPadding: string; gap: string }) {
  return (
    <Panel level="card" padding={padding} radius={radius}>
      {activity.map((a, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap, padding: rowPadding, borderBottom: i === activity.length - 1 ? 'none' : 'var(--border-hairline)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-pill)', background: a.tone, flex: 'none' }} />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--color-cloud)', flex: 1 }}>{a.body}</span>
          <MonoLabel size="tiny" tone="var(--text-muted)">{a.time}</MonoLabel>
        </div>
      ))}
    </Panel>
  );
}

export function BusiestPair({ tie, height, baseline }: { tie: number; height: number; baseline: number }) {
  const top = baseline;
  return (
    <>
      <MonoLabel size="tiny" tone="var(--text-muted)">Busiest pair</MonoLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)' }}>
        <AgentAvatar name="Maya" tone="var(--color-orchid-bloom)" size="sm" />
        <span style={{ width: tie, height: 1, background: 'var(--color-pure)', opacity: 0.55 }} />
        <AgentAvatar name="Zeph" tone="var(--color-periwinkle)" size="sm" />
        <MonoLabel size="tiny" tone="var(--text-body)" style={{ marginLeft: 'auto' }}>14 exchanges</MonoLabel>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 240 ${height}`} fill="none" preserveAspectRatio="none">
        <polyline
          points={`0,${top} 30,${top - 6} 60,${top - 4} 90,${top - 20} 120,${top - 16} 150,${top - 30} 180,${top - 26} 210,${top - 38} 240,${top - 34}`}
          stroke="var(--data-signal)"
          strokeWidth="1.5"
        />
      </svg>
    </>
  );
}
