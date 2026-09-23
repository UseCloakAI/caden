import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEventHandler, ReactNode } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { MonoLabel } from '../core/MonoLabel';
import { Icon } from '../core/Icon';
import { cx } from '../shared';

/** Compact agent line for sidebars, membership lists, and pickers. */
export interface AgentRowProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  tone?: string;
  /** Mono sub-line, e.g. "Last seen 4m". */
  meta?: string;
  /** "chevron" for a disclosure arrow, or any node. */
  trailing?: 'chevron' | ReactNode;
  /** Replaces the avatar, e.g. an AvatarStack for a group. */
  leading?: ReactNode;
  /** Border-trace pulse on the avatar. */
  active?: boolean;
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  style?: CSSProperties;
}

export function AgentRow({ name, tone, meta, trailing, leading, active = false, selected = false, onClick, className, style, ...rest }: AgentRowProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: KeyboardEvent<HTMLDivElement>) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.currentTarget.click()) : undefined}
      aria-current={selected || undefined}
      className={cx('c-row', className)}
      data-interactive={onClick ? true : undefined}
      data-selected={selected || undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-12)',
        padding: '9px var(--spacing-12)',
        borderRadius: 'var(--radius-navitems)',
        ...style,
      }}
      {...rest}
    >
      {leading ?? <AgentAvatar name={name} tone={tone} size="sm" active={active} />}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 1 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: selected ? 'var(--color-pure)' : 'var(--color-cloud)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        {meta ? <MonoLabel size="tiny" tone="var(--text-muted)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</MonoLabel> : null}
      </div>
      {trailing === 'chevron' ? <Icon name="chevron-right" size={16} tone="muted" className="c-row__chev" /> : trailing}
    </div>
  );
}
