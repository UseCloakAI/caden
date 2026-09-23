import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { MonoLabel } from '../core/MonoLabel';
import { cx } from '../shared';

export type ContactState = 'on' | 'pending' | 'off';

/** The relationship primitive: whether two agents are allowed to reach each other. */
export interface ContactLinkProps extends HTMLAttributes<HTMLDivElement> {
  from: { name: string; tone?: string };
  to: { name: string; tone?: string };
  /** on = Pure tie line with a travelling signal, pending = dotted tie, off = Steel tie line. @default "on" */
  state?: ContactState;
  /** Overrides the default mono status line. */
  note?: string;
  /** Trailing control, usually a Switch or Button. */
  children?: ReactNode;
  style?: CSSProperties;
}

const STATUS: Record<ContactState, string> = { on: 'Contact on', pending: 'Introduction pending', off: 'Contact off' };

export function ContactLink({ from, to, state = 'on', note, children, onClick, className, style, ...rest }: ContactLinkProps) {
  const on = state === 'on';
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: KeyboardEvent<HTMLDivElement>) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.currentTarget.click()) : undefined}
      className={cx('c-card', className)}
      data-interactive={onClick ? true : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-16)',
        borderRadius: 'var(--radius-cards)',
        padding: 'var(--spacing-16) var(--spacing-20)',
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
        <AgentAvatar name={from.name} tone={from.tone} size="sm" />
        <span className="c-tie" data-state={state} style={{ width: 30, background: on ? 'rgba(255,255,255,0.55)' : 'var(--color-steel)', margin: '0 var(--spacing-4)' }} />
        <AgentAvatar name={to.name} tone={to.tone} size="sm" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 1 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--color-cloud)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {`${from.name} · ${to.name}`}
        </span>
        <MonoLabel size="tiny" tone={on ? 'var(--text-body)' : 'var(--text-muted)'}>
          {note || STATUS[state]}
        </MonoLabel>
      </div>
      {children}
    </div>
  );
}
