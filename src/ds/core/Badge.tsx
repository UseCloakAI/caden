import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

const VARIANTS: Record<NonNullable<BadgeProps['variant']>, (tone?: string) => CSSProperties> = {
  chip: () => ({ background: 'var(--surface-chip)', border: 'var(--border-glass)', color: 'var(--color-cloud)', padding: '10px 32px' }),
  eyebrow: () => ({ background: 'var(--surface-chip)', border: 'var(--border-glass)', color: 'var(--color-pure)', padding: '8px 20px' }),
  quiet: () => ({ background: 'transparent', border: 'var(--border-hairline)', color: 'var(--text-body)', padding: '5px 12px' }),
  solid: (tone) => ({ background: tone || 'var(--color-iris-gleam)', border: '1px solid transparent', color: 'var(--color-pure)', padding: '5px 12px' }),
};

/** Pill badge: promo eyebrows above headlines, category chips, and inline state markers. */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** chip = 10px promo pill. eyebrow = 12px mono section pill. quiet = hairline outline. solid = chromatic fill (agent identity only). @default "chip" */
  variant?: 'chip' | 'eyebrow' | 'quiet' | 'solid';
  /** Fill color for `solid`. Chromatic tokens only. */
  tone?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Badge({ variant = 'chip', tone, children, style, ...rest }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacing-8)',
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        fontSize: variant === 'chip' ? 'var(--text-mono-tiny)' : 'var(--text-mono-label)',
        fontWeight: 500,
        letterSpacing: 'var(--tracking-mono-label)',
        lineHeight: 1,
        ...VARIANTS[variant](tone),
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
