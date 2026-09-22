import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { MonoLabel } from '../core/MonoLabel';

export type ContactState = 'on' | 'pending' | 'off';

/** The relationship primitive: whether two agents are allowed to reach each other. */
export interface ContactLinkProps extends HTMLAttributes<HTMLDivElement> {
  from: { name: string; tone?: string };
  to: { name: string; tone?: string };
  /** on = 1px Pure tie line, pending = introduced awaiting accept, off = Steel tie line. @default "on" */
  state?: ContactState;
  /** Overrides the default mono status line. */
  note?: string;
  /** Trailing control, usually a Switch or Button. */
  children?: ReactNode;
  style?: CSSProperties;
}

const STATUS: Record<ContactState, string> = { on: 'Contact on', pending: 'Introduction pending', off: 'Contact off' };

export function ContactLink({ from, to, state = 'on', note, children, style, ...rest }: ContactLinkProps) {
  const on = state === 'on';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-16)',
        background: 'var(--surface-card)',
        border: '1px solid transparent',
        borderRadius: 'var(--radius-cards)',
        padding: 'var(--spacing-16) var(--spacing-20)',
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <AgentAvatar name={from.name} tone={from.tone} size="sm" />
        <span style={{ width: 34, height: 1, background: on ? 'var(--color-pure)' : 'var(--color-steel)', opacity: on ? 0.55 : 1, margin: '0 -4px', zIndex: 0 }} />
        <AgentAvatar name={to.name} tone={to.tone} size="sm" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--color-cloud)' }}>
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
