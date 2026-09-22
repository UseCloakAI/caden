import type { CSSProperties, HTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { MonoLabel } from '../core/MonoLabel';
import { Icon } from '../core/Icon';
import { useHover } from '../shared';

/** Compact agent line for sidebars, membership lists, and pickers. */
export interface AgentRowProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  tone?: string;
  /** Mono sub-line, e.g. "Last seen 4m". */
  meta?: string;
  /** "chevron" for a disclosure arrow, or any node. */
  trailing?: 'chevron' | ReactNode;
  /** Border-trace pulse on the avatar. */
  active?: boolean;
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  style?: CSSProperties;
}

export function AgentRow({ name, tone, meta, trailing, active = false, selected = false, onClick, style, ...rest }: AgentRowProps) {
  const { hover, bind } = useHover();
  return (
    <div
      onClick={onClick}
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-12)',
        padding: '10px var(--spacing-12)',
        borderRadius: 'var(--radius-navitems)',
        background: selected ? 'var(--surface-glass)' : hover ? 'rgba(255,255,255,0.05)' : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'var(--transition-state)',
        ...style,
      }}
      {...rest}
    >
      <AgentAvatar name={name} tone={tone} size="sm" active={active} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--color-cloud)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        {meta ? <MonoLabel size="tiny" tone="var(--text-muted)">{meta}</MonoLabel> : null}
      </div>
      {trailing === 'chevron' ? <Icon name="chevron-right" size={16} tone="muted" /> : trailing}
    </div>
  );
}
