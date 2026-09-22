import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Wordmark } from '../core/Wordmark';
import { Button } from '../core/Button';

/** Sticky glass top bar — wordmark, mono glass nav items, one primary CTA flush right. */
export interface NavBarProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  /** Nav labels, rendered as mono uppercase glass buttons. */
  items?: string[];
  active?: string;
  onSelect?: (item: string) => void;
  /** Right-hand cluster — a text log-in link plus one primary Button. */
  trailing?: ReactNode;
  style?: CSSProperties;
}

export function NavBar({ items = [], active, onSelect, trailing, style, ...rest }: NavBarProps) {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-24)',
        padding: 'var(--spacing-12) var(--spacing-20)',
        background: 'rgba(15,16,17,0.6)',
        backdropFilter: 'var(--blur-glass)',
        WebkitBackdropFilter: 'var(--blur-glass)',
        borderBottom: 'var(--border-hairline)',
        ...style,
      }}
      {...rest}
    >
      <Wordmark size={22} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-8)', marginLeft: 'var(--spacing-16)' }}>
        {items.map((item) => (
          <Button
            key={item}
            variant="glass"
            onClick={() => onSelect?.(item)}
            style={active === item ? { background: 'var(--surface-glass-strong)' } : { background: 'transparent', borderColor: 'rgba(255,255,255,0.15)' }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontSize: 'var(--text-mono-tiny)', letterSpacing: 'var(--tracking-mono-micro)' }}>{item}</span>
          </Button>
        ))}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)' }}>{trailing}</div>
    </nav>
  );
}
