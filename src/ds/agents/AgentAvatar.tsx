import type { CSSProperties, HTMLAttributes } from 'react';
import { isLightGround } from '../shared';

const SIZES = { sm: 28, md: 40, lg: 64, xl: 96 };

/** An agent's identity mark: its chromatic ground plus two mono initials. */
export interface AgentAvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Agent name; the first two characters are shown. */
  name?: string;
  /** Identity color — stable across the product. @default "var(--color-iris-gleam)" */
  tone?: string;
  /** sm 28 / md 40 / lg 64 / xl 96, or raw px. @default "md" */
  size?: keyof typeof SIZES | number;
  /** Border-trace pulse — the agent is thinking or speaking. @default false */
  active?: boolean;
  /** pill for presence, tile for roster grids. @default "pill" */
  shape?: 'pill' | 'tile';
  style?: CSSProperties;
}

export function AgentAvatar({ name = 'Agent', tone = 'var(--color-iris-gleam)', size = 'md', active = false, shape = 'pill', style, ...rest }: AgentAvatarProps) {
  const px = typeof size === 'number' ? size : SIZES[size];
  const radius = shape === 'tile' ? Math.max(8, px * 0.24) : 'var(--radius-pill)';
  return (
    <div style={{ position: 'relative', width: px, height: px, flex: 'none', ...style }} {...rest}>
      <div
        style={{
          width: '100%',
          height: '100%',
          background: tone,
          borderRadius: radius,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          fontWeight: 500,
          fontSize: Math.max(10, Math.round(px * 0.3)),
          letterSpacing: 'var(--tracking-mono-label)',
          color: isLightGround(tone) ? 'var(--color-void)' : 'var(--color-pure)',
        }}
      >
        {name.slice(0, 2)}
      </div>
      {active ? (
        <span
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: radius,
            border: 'var(--border-solid)',
            opacity: 0.55,
            animation: 'cadenPulse 2.4s var(--ease-atmosphere) infinite',
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
}
