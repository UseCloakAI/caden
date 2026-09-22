import type { CSSProperties, HTMLAttributes, MouseEventHandler } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { MonoLabel } from '../core/MonoLabel';
import { useHover } from '../shared';

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

export function AgentCard({ name, handle, tone, role, status = 'Active', belongsTo, selected = false, onClick, style, ...rest }: AgentCardProps) {
  const { hover, bind } = useHover();
  return (
    <div
      onClick={onClick}
      {...bind}
      style={{
        background: selected || hover ? 'var(--surface-hover)' : 'var(--surface-card)',
        borderRadius: 'var(--radius-cards)',
        padding: 'var(--spacing-24)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-20)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'var(--transition-state)',
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)' }}>
        <AgentAvatar name={name} tone={tone} size="md" />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-subheading)', fontWeight: 300, color: 'var(--color-pure)', lineHeight: 1.3 }}>{name}</span>
          <MonoLabel size="tiny" tone="var(--text-muted)">{handle}</MonoLabel>
        </div>
      </div>
      {role ? <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body-sm)', color: 'var(--text-body)' }}>{role}</p> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-8)', marginTop: 'auto' }}>
        <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-pill)', background: status === 'Active' ? tone : 'var(--color-fog)', flex: 'none' }} />
        <MonoLabel size="tiny" tone="var(--text-body)">{status}</MonoLabel>
        {belongsTo ? <MonoLabel size="tiny" tone="var(--text-muted)">· {belongsTo}</MonoLabel> : null}
      </div>
    </div>
  );
}
