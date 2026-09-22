import type { CSSProperties, HTMLAttributes } from 'react';
import { GlassSurface } from './GlassSurface';
import { Icon, type IconName } from '../core/Icon';

/** Floating liquid-glass tab bar. Active tab is a 20% white inner capsule. */
export interface GlassTabBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  items?: Array<{ id: string; label: string; icon: IconName }>;
  active?: string;
  onSelect?: (id: string) => void;
  style?: CSSProperties;
}

export function GlassTabBar({ items = [], active, onSelect, style, ...rest }: GlassTabBarProps) {
  return (
    <GlassSurface variant="bar" floating padding="6px" style={{ display: 'flex', gap: 4, ...style }} {...rest}>
      {items.map((item) => {
        const on = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelect?.(item.id)}
            style={{
              flex: 1,
              minWidth: 74,
              border: 'none',
              cursor: 'pointer',
              borderRadius: 22,
              padding: '9px 10px',
              background: on ? 'rgba(255,255,255,0.20)' : 'transparent',
              boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,0.4)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              transition: 'var(--transition-state)',
            }}
          >
            <Icon name={item.icon} size={20} tone={on ? 'pure' : 'ash'} />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                fontSize: 'var(--text-mono-tiny)',
                letterSpacing: 'var(--tracking-mono-tiny)',
                color: on ? 'var(--color-pure)' : 'var(--text-body)',
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </GlassSurface>
  );
}
