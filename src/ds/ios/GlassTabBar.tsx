import { useRef, type CSSProperties, type HTMLAttributes } from 'react';
import { GlassSurface } from './GlassSurface';
import { Icon, type IconName } from '../core/Icon';
import { useIndicator } from '../shared';

/** Floating liquid-glass tab bar. The active tab sits in a 20% white capsule that slides between tabs. */
export interface GlassTabBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  items?: Array<{ id: string; label: string; icon: IconName }>;
  active?: string;
  onSelect?: (id: string) => void;
  style?: CSSProperties;
}

export function GlassTabBar({ items = [], active, onSelect, style, ...rest }: GlassTabBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useIndicator(ref, active);
  return (
    <GlassSurface variant="bar" floating padding="6px" style={style} {...rest}>
      <nav ref={ref} className="c-tabbar">
        <span
          className="c-tabbar__indicator"
          aria-hidden="true"
          style={{ top: 0, bottom: 0, width: box.size, transform: `translate3d(${box.offset}px,0,0)`, opacity: box.size ? 1 : 0, transition: box.ready ? undefined : 'none' }}
        />
        {items.map((item) => {
          const on = active === item.id;
          return (
            <button key={item.id} type="button" data-key={item.id} className="c-tabbar__item" aria-current={on || undefined} onClick={() => onSelect?.(item.id)}>
              <Icon name={item.icon} size={20} tone={on ? 'pure' : 'ash'} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </GlassSurface>
  );
}
