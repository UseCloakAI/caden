import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { AgentAvatar } from '../agents/AgentAvatar';
import { MonoLabel } from '../core/MonoLabel';
import { cx } from '../shared';

/** One turn in a circle thread. Agents and people are rendered as peers. */
export interface MessageProps extends HTMLAttributes<HTMLDivElement> {
  /** Speaker name — an agent's or a person's. */
  author?: string;
  /** Speaker's identity color (agents only). */
  tone?: string;
  /** agent = Graphite bubble + avatar. you = white bubble, right. system = centred mono line. @default "agent" */
  kind?: 'agent' | 'you' | 'system';
  /** Mono timestamp, e.g. "4m". */
  time?: string;
  /** Under the bubble — reactions, delivery state. */
  footer?: ReactNode;
  /** A follow-on from the same speaker: no avatar or name, tighter spacing. @default false */
  grouped?: boolean;
  /** Play the arrival animation. Use for messages that land while the thread is open. @default false */
  animate?: boolean;
  /** Bubble max width. @default 520 */
  maxWidth?: number | string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Message({ author, tone, kind = 'agent', time, footer, grouped = false, animate = false, maxWidth = 520, children, className, style, ...rest }: MessageProps) {
  const mine = kind === 'you';
  if (kind === 'system') {
    return (
      <div className={cx('c-msg', className)} data-enter={animate || undefined} style={{ justifyContent: 'center', padding: 'var(--spacing-8) 0', ...style }} {...rest}>
        <MonoLabel size="tiny" tone="var(--text-muted)" style={{ textAlign: 'center', padding: '4px 12px', borderRadius: 'var(--radius-pill)', border: 'var(--border-hairline)' }}>{children}</MonoLabel>
      </div>
    );
  }
  return (
    <div
      className={cx('c-msg', mine && 'c-msg--you', className)}
      data-enter={animate || undefined}
      style={{ flexDirection: mine ? 'row-reverse' : 'row', marginTop: grouped ? 'calc(var(--spacing-12) * -1 + 4px)' : undefined, ...style }}
      {...rest}
    >
      {mine ? null : grouped ? <div style={{ width: 28, flex: 'none' }} /> : <AgentAvatar name={author} tone={tone} size="sm" />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', alignItems: mine ? 'flex-end' : 'flex-start', maxWidth, minWidth: 0 }}>
        {grouped ? null : (
          <div style={{ display: 'flex', gap: 'var(--spacing-8)', alignItems: 'baseline' }}>
            <MonoLabel size="tiny" tone="var(--color-cloud)">{author}</MonoLabel>
            {time ? <MonoLabel size="tiny" tone="var(--text-muted)">{time}</MonoLabel> : null}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--spacing-8)', flexDirection: mine ? 'row-reverse' : 'row', maxWidth: '100%' }}>
          <div
            className="c-msg__bubble"
            style={{
              background: mine ? 'var(--color-pure)' : 'var(--surface-card)',
              color: mine ? 'var(--color-void)' : 'var(--color-cloud)',
              borderTopLeftRadius: !mine && !grouped ? 4 : undefined,
              borderTopRightRadius: mine && !grouped ? 4 : undefined,
              minWidth: 0,
            }}
          >
            {children}
          </div>
          {grouped && time ? <MonoLabel size="tiny" tone="var(--text-muted)" className="c-msg__time" style={{ flex: 'none', paddingBottom: 6 }}>{time}</MonoLabel> : null}
        </div>
        {footer}
      </div>
    </div>
  );
}

/** Three breathing dots in a bubble, with the avatar of whoever is composing. */
export function TypingIndicator({ author, tone, label, style }: { author?: string; tone?: string; label?: string; style?: CSSProperties }) {
  return (
    <div className="c-msg" data-enter style={{ alignItems: 'flex-end', ...style }} role="status" aria-live="polite">
      {author ? <AgentAvatar name={author} tone={tone} size="sm" active /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
        {label ? <MonoLabel size="tiny" tone="var(--text-muted)">{label}</MonoLabel> : null}
        <span className="c-typing" aria-hidden="true" style={{ borderTopLeftRadius: 4 }}>
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
