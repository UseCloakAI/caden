import type { CSSProperties, HTMLAttributes } from 'react';
import { cx, isLightGround } from '../shared';

const SIZES = { xs: 22, sm: 28, md: 40, lg: 64, xl: 96 };

/** An agent's identity mark: its chromatic ground plus two mono initials. */
export interface AgentAvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Agent name; the first two characters are shown. */
  name?: string;
  /** Identity color — stable across the product. @default "var(--color-iris-gleam)" */
  tone?: string;
  /** xs 22 / sm 28 / md 40 / lg 64 / xl 96, or raw px. @default "md" */
  size?: keyof typeof SIZES | number;
  /** Border trace — a 1px arc circling the frame while the agent is thinking or speaking. @default false */
  active?: boolean;
  /** pill for presence, tile for roster grids. @default "pill" */
  shape?: 'pill' | 'tile';
  /** A ring in the canvas colour, for avatars stacked over one another. @default false */
  ring?: boolean | string;
  style?: CSSProperties;
}

export function AgentAvatar({ name = 'Agent', tone = 'var(--color-iris-gleam)', size = 'md', active = false, shape = 'pill', ring = false, className, style, ...rest }: AgentAvatarProps) {
  const px = typeof size === 'number' ? size : SIZES[size];
  const radiusPx = shape === 'tile' ? Math.max(8, px * 0.24) : px / 2;
  const initials = name.trim().slice(0, 2) || '··';
  return (
    <div className={cx('c-avatar', className)} style={{ width: px, height: px, ...style }} {...rest}>
      <div
        className="c-avatar__face"
        style={{
          background: tone,
          borderRadius: shape === 'tile' ? radiusPx : 'var(--radius-pill)',
          fontSize: Math.max(9, Math.round(px * 0.3)),
          color: isLightGround(tone) ? 'var(--color-void)' : 'var(--color-pure)',
          boxShadow: ring ? `0 0 0 2px ${typeof ring === 'string' ? ring : 'var(--surface-canvas)'}` : undefined,
        }}
      >
        {initials}
      </div>
      {active ? (
        <svg className="c-avatar__trace" viewBox={`0 0 ${px + 8} ${px + 8}`} aria-hidden="true">
          <rect className="c-trace-rest" x={0.5} y={0.5} width={px + 7} height={px + 7} rx={radiusPx + 3.5} />
          <rect className="c-trace-run" x={0.5} y={0.5} width={px + 7} height={px + 7} rx={radiusPx + 3.5} pathLength={100} />
        </svg>
      ) : null}
    </div>
  );
}

/** Overlapping avatar stack for circles, offices and thread headers. */
export function AvatarStack({ people, size = 'sm', max = 5, ring = 'var(--surface-canvas)', style }: { people: Array<{ name: string; tone?: string }>; size?: AgentAvatarProps['size']; max?: number; ring?: string; style?: CSSProperties }) {
  const px = typeof size === 'number' ? size : SIZES[size];
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="c-avatars" style={style}>
      {shown.map((p, i) => (
        <AgentAvatar key={p.name + i} name={p.name} tone={p.tone} size={size} ring={ring} style={{ marginLeft: i === 0 ? 0 : -Math.round(px * 0.3), zIndex: shown.length - i }} />
      ))}
      {extra > 0 ? (
        <div
          style={{
            marginLeft: -Math.round(px * 0.3),
            width: px,
            height: px,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface-hover)',
            boxShadow: `0 0 0 2px ${ring}`,
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: Math.max(9, Math.round(px * 0.3)),
            color: 'var(--color-cloud)',
          }}
        >
          {`+${extra}`}
        </div>
      ) : null}
    </div>
  );
}
