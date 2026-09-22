import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { MonoLabel } from '../core/MonoLabel';
import { Icon, type IconName } from '../core/Icon';

export interface SideRailItem {
  id: string;
  label: string;
  icon?: IconName;
  count?: number | string;
}

/** App sidebar: mono section eyebrows over 8px-radius nav items on the Abyss band. */
export interface SideRailProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  sections?: Array<{ label: string; items: SideRailItem[] }>;
  active?: string;
  onSelect?: (id: string) => void;
  /** Pinned bottom slot — account row, plan chip. */
  footer?: ReactNode;
  style?: CSSProperties;
}

export function SideRail({ sections = [], active, onSelect, footer, style, ...rest }: SideRailProps) {
  return (
    <aside
      style={{
        width: 248,
        flex: 'none',
        background: 'var(--surface-sunken)',
        borderRight: 'var(--border-hairline)',
        padding: 'var(--spacing-20) var(--spacing-12)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-24)',
        ...style,
      }}
      {...rest}
    >
      {sections.map((section) => (
        <div key={section.label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: '0 var(--spacing-12) var(--spacing-8)' }}>{section.label}</MonoLabel>
          {section.items.map((item) => {
            const on = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelect?.(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-12)',
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px var(--spacing-12)',
                  border: 'none',
                  borderRadius: 'var(--radius-navitems)',
                  background: on ? 'var(--surface-glass)' : 'transparent',
                  color: on ? 'var(--color-pure)' : 'var(--text-body)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-body-sm)',
                  cursor: 'pointer',
                  transition: 'var(--transition-state)',
                }}
              >
                {item.icon ? <Icon name={item.icon} size={16} tone={on ? 'pure' : 'muted'} /> : null}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count != null ? <MonoLabel size="tiny" tone="var(--text-muted)">{item.count}</MonoLabel> : null}
              </button>
            );
          })}
        </div>
      ))}
      <div style={{ marginTop: 'auto' }}>{footer}</div>
    </aside>
  );
}
