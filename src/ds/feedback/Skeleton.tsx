import type { CSSProperties } from 'react';

/** Loading placeholder with a slow shimmer. Match the size of what is coming. */
export function Skeleton({ width = '100%', height = 14, radius = 'var(--radius-sm)', style }: { width?: number | string; height?: number | string; radius?: string; style?: CSSProperties }) {
  return <span className="c-skel" aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}
