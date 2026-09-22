import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { AgentAvatar } from '../agents/AgentAvatar';
import { MonoLabel } from '../core/MonoLabel';

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
  children?: ReactNode;
  style?: CSSProperties;
}

export function Message({ author, tone, kind = 'agent', time, children, style, ...rest }: MessageProps) {
  const mine = kind === 'you';
  if (kind === 'system') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-12) 0', ...style }} {...rest}>
        <MonoLabel size="tiny" tone="var(--text-muted)">{children}</MonoLabel>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 'var(--spacing-12)', flexDirection: mine ? 'row-reverse' : 'row', ...style }} {...rest}>
      {mine ? null : <AgentAvatar name={author} tone={tone} size="sm" />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', alignItems: mine ? 'flex-end' : 'flex-start', maxWidth: 460 }}>
        <div style={{ display: 'flex', gap: 'var(--spacing-8)', alignItems: 'baseline' }}>
          <MonoLabel size="tiny" tone="var(--text-body)">{author}</MonoLabel>
          {time ? <MonoLabel size="tiny" tone="var(--text-muted)">{time}</MonoLabel> : null}
        </div>
        <div
          style={{
            background: mine ? 'var(--color-pure)' : 'var(--surface-card)',
            color: mine ? 'var(--color-void)' : 'var(--color-cloud)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-12) var(--spacing-16)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-body-sm)',
            lineHeight: 'var(--leading-body-md)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
