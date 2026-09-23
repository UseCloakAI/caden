import { useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { MonoLabel } from '../core/MonoLabel';
import { Icon, type IconName } from '../core/Icon';
import { cx, useIndicator } from '../shared';

export interface SideRailItem {
  id: string;
  label: string;
  icon?: IconName;
  count?: number | string;
}

/** App sidebar: mono section eyebrows over nav items on the Abyss band, with a sliding selection. */
export interface SideRailProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  sections?: Array<{ label: string; items: SideRailItem[] }>;
  active?: string;
  onSelect?: (id: string) => void;
  /** Pinned top slot — wordmark, office switcher. */
  header?: ReactNode;
  /** Pinned bottom slot — account row, plan chip. */
  footer?: ReactNode;
  style?: CSSProperties;
}

function RailSection({ label, items, active, onSelect }: { label: string; items: SideRailItem[]; active?: string; onSelect?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const has = items.some((i) => i.id === active);
  const box = useIndicator(ref, has ? active : undefined, 'y');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
      <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: '0 var(--spacing-12)' }}>{label}</MonoLabel>
      <div ref={ref} className="c-rail__group">
        <span
          className="c-rail__indicator"
          aria-hidden="true"
          style={{ height: box.size, transform: `translate3d(0,${box.offset}px,0)`, opacity: has && box.size ? 1 : 0, transition: box.ready ? undefined : 'none' }}
        />
        {items.map((item) => {
          const on = active === item.id;
          return (
            <button key={item.id} type="button" data-key={item.id} className="c-rail__item" aria-current={on || undefined} onClick={() => onSelect?.(item.id)}>
              {item.icon ? <Icon name={item.icon} size={16} tone={on ? 'pure' : 'muted'} /> : null}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              {item.count != null ? <span className="c-rail__count">{item.count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SideRail({ sections = [], active, onSelect, header, footer, className, style, ...rest }: SideRailProps) {
  return (
    <aside className={cx('c-rail', className)} style={style} {...rest}>
      {header}
      {sections.map((section) => (
        <RailSection key={section.label} label={section.label} items={section.items} active={active} onSelect={onSelect} />
      ))}
      <div style={{ marginTop: 'auto' }}>{footer}</div>
    </aside>
  );
}
