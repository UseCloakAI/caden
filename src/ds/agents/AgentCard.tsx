import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEventHandler } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { MonoLabel } from '../core/MonoLabel';
import { cx, type StyleVars } from '../shared';

/** Roster card for a single agent — identity, handle, what it does, who it belongs to. */
export interface AgentCardProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  /** Mono handle, e.g. "@maya.agent". */
  handle?: string;
  /** Identity color (chromatic token). */
  tone?: string;
  /** One line on what the agent does. */
  role?: string;
  /** Presence. @default "Active" */
  status?: 'Active' | 'Idle' | 'Paused' | (string & {});
  /** Owner or circle, rendered as a mono suffix, e.g. "Maya's". */
  belongsTo?: string;
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  style?: CSSProperties;
}

export function AgentCard({ name, handle, tone, role, status = 'Active', belongsTo, selected = false, onClick, className, style, ...rest }: AgentCardProps) {
  const live = status === 'Active';
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: KeyboardEvent<HTMLDivElement>) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.currentTarget.click()) : undefined}
      className={cx('c-card', className)}
      data-interactive={onClick ? true : undefined}
      data-selected={selected || undefined}
      style={{
        borderRadius: 'var(--radius-cards)',
        padding: 'var(--spacing-24)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-20)',
        minHeight: 196,
        boxShadow: 'var(--shadow-specular)',
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)' }}>
        <AgentAvatar name={name} tone={tone} size="md" />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', gap: 2 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-subheading)', fontWeight: 400, color: 'var(--color-pure)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          {handle ? <MonoLabel size="tiny" tone="var(--text-muted)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{handle}</MonoLabel> : null}
        </div>
      </div>
      {role ? (
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body-sm)', color: 'var(--text-body)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{role}</p>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-8)', marginTop: 'auto' }}>
        <span className="c-dot" data-live={live || undefined} style={{ '--dot': live ? tone ?? 'var(--color-pure)' : 'var(--color-fog)' } as StyleVars} />
        <MonoLabel size="tiny" tone="var(--text-body)">{status}</MonoLabel>
        {belongsTo ? <MonoLabel size="tiny" tone="var(--text-muted)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {belongsTo}</MonoLabel> : null}
      </div>
    </div>
  );
}
