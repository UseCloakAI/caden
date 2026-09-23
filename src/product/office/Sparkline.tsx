import { useState } from 'react';
import { MonoLabel } from '@/ds';

/**
 * Single-series daily sparkline in the data voice: 2px Cyan Signal line, no legend (the
 * caption names it), per-day hover readout, and a visually hidden table for screen readers.
 */
export function Sparkline({ points, caption, height = 56 }: { points: Array<{ label: string; value: number }>; caption: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 240;
  const pad = 4;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => [pad + i * step, height - pad - (p.value / max) * (height - pad * 2)] as const);
  const active = hover != null ? points[hover] : points[points.length - 1];

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--spacing-8)' }}>
        <MonoLabel size="tiny" tone="var(--text-muted)">{caption}</MonoLabel>
        {active ? <MonoLabel size="tiny" tone="var(--color-cloud)">{`${active.label} · ${active.value}`}</MonoLabel> : null}
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden="true" onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={w} y1={height - pad} y2={height - pad} stroke="rgba(255,255,255,0.1)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <polyline points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="var(--data-signal)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover != null ? <line x1={xy[hover][0]} x2={xy[hover][0]} y1={0} y2={height} stroke="rgba(255,255,255,0.25)" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
        {xy.map(([x], i) => (
          <rect key={i} x={x - step / 2} y={0} width={Math.max(step, 8)} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <table style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        <caption>{caption}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
