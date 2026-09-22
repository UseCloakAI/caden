import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/**
 * The hero sky: Sky Atmosphere gradient, fractal-noise grain in overlay, and a fade into the
 * canvas. The only place grain appears in the system.
 */
export interface SkyFieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Grain opacity. 0.30–0.42 is the usable range. @default 0.36 */
  grain?: number;
  children?: ReactNode;
  style?: CSSProperties;
}

export function SkyField({ grain = 0.36, children, style, ...rest }: SkyFieldProps) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', ...style }} {...rest}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--gradient-atmosphere)' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'var(--texture-noise)',
          backgroundSize: '200px 200px',
          opacity: grain,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '45%',
          background: 'linear-gradient(rgba(15,16,17,0), var(--surface-canvas))',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}
