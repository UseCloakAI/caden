import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/**
 * The hero sky: Sky Atmosphere gradient, fractal-noise grain in overlay, and a fade into the
 * canvas. The only place grain appears in the system.
 */
export interface SkyFieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Grain opacity. 0.30–0.42 is the usable range. @default 0.36 */
  grain?: number;
  /** The horizon breathes: the gradient drifts slowly up and down. @default false */
  drift?: boolean;
  /** Height of the fade into the canvas at the bottom edge. @default "45%" */
  fade?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function SkyField({ grain = 0.36, drift = false, fade = '45%', children, style, ...rest }: SkyFieldProps) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate', ...style }} {...rest}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: -1,
          background: 'var(--gradient-atmosphere)',
          backgroundSize: drift ? '100% 135%' : undefined,
          animation: drift ? 'cadenSkyDrift 22s var(--ease-in-out) infinite' : undefined,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: -1,
          backgroundImage: 'var(--texture-noise)',
          backgroundSize: '200px 200px',
          opacity: grain,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -1,
          height: fade,
          background: 'linear-gradient(rgba(15,16,17,0), var(--surface-canvas))',
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
}
