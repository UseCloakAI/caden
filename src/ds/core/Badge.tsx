import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cx, type StyleVars } from '../shared';

const VARIANTS: Record<NonNullable<BadgeProps['variant']>, (tone?: string) => CSSProperties> = {
  chip: () => ({ background: 'var(--surface-chip)', border: 'var(--border-glass)', color: 'var(--color-cloud)', padding: '9px 18px' }),
  eyebrow: () => ({ background: 'var(--surface-chip)', border: 'var(--border-glass)', color: 'var(--color-pure)', padding: '8px 16px' }),
  quiet: () => ({ background: 'transparent', border: 'var(--border-hairline)', color: 'var(--text-body)', padding: '5px 10px' }),
  solid: (tone) => ({ background: tone || 'var(--color-iris-gleam)', border: '1px solid transparent', color: 'var(--color-pure)', padding: '5px 12px' }),
};

/** Pill badge: promo eyebrows above headlines, category chips, and inline state markers. */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** chip = 10px promo pill. eyebrow = 12px mono section pill. quiet = hairline outline. solid = chromatic fill (agent identity only). @default "chip" */
  variant?: 'chip' | 'eyebrow' | 'quiet' | 'solid';
  /** Fill color for `solid`. Chromatic tokens only. */
  tone?: string;
  /** Leading presence dot. `live` adds the ping. Pass a colour token to tint it. */
  dot?: boolean | 'live' | string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Badge({ variant = 'chip', tone, dot, children, className, style, ...rest }: BadgeProps) {
  const dotTone = typeof dot === 'string' && dot !== 'live' ? dot : 'var(--data-signal)';
  return (
    <span
      className={cx('c-badge', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacing-8)',
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        fontSize: variant === 'chip' ? 'var(--text-mono-tiny)' : variant === 'quiet' ? 'var(--text-mono-tiny)' : 'var(--text-mono-label)',
        fontWeight: 500,
        letterSpacing: variant === 'chip' ? 'var(--tracking-mono-label)' : 'var(--tracking-mono-label)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...VARIANTS[variant](tone),
        ...style,
      }}
      {...rest}
    >
      {dot ? <span className="c-dot" data-live={dot === 'live' || undefined} style={{ '--dot': dotTone } as StyleVars} /> : null}
      {children}
    </span>
  );
}
