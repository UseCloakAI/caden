import { useLayoutEffect, useState } from 'react';
import { MonoLabel, useInView } from '@/ds';

/**
 * Single-series daily sparkline in the data voice: 2px Cyan Signal line that draws itself in,
 * no legend (the caption names it), per-day hover readout, and a hidden table for screen readers.
 */
export function Sparkline({ points, caption, height = 64 }: { points: Array<{ label: string; value: number }>; caption: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, inView] = useInView<SVGSVGElement>();
  // Draw in real pixels so the stroke never stretches and the draw-in dash measures true.
  const [w, setW] = useState(240);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(40, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  const pad = 5;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => [pad + i * step, height - pad - (p.value / max) * (height - pad * 2)] as const);
  const shown = hover ?? points.length - 1;
  const active = points[shown];

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--spacing-8)' }}>
        <MonoLabel size="tiny" tone="var(--text-muted)">{caption}</MonoLabel>
        {active ? <MonoLabel size="tiny" tone="var(--color-cloud)" style={{ fontVariantNumeric: 'tabular-nums' }}>{`${active.label} · ${active.value}`}</MonoLabel> : null}
      </div>
      <svg ref={ref} width="100%" height={height} viewBox={`0 0 ${w} ${height}`} aria-hidden="true" onMouseLeave={() => setHover(null)} style={{ overflow: 'visible' }}>
        <line x1={0} x2={w} y1={height - pad} y2={height - pad} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        <polyline
          key={w}
          points={xy.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="var(--data-signal)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="p-spark-line"
          data-in={inView || undefined}
        />
        <line x1={xy[shown]?.[0]} x2={xy[shown]?.[0]} y1={0} y2={height} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ opacity: hover == null ? 0 : 1, transition: 'opacity var(--duration-state)' }} />
        {xy.map(([x], i) => (
          <rect key={i} x={x - step / 2} y={0} width={Math.max(step, 8)} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {xy[shown] ? (
        <span
          className="p-spark-dot"
          data-in={inView || undefined}
          style={{ left: `${(xy[shown][0] / w) * 100}%`, top: `calc(100% - ${height}px + ${xy[shown][1]}px)` }}
          aria-hidden="true"
        />
      ) : null}
      <table className="c-sr-only">
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
