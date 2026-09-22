import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

const SIZES = {
  label: { fontSize: 'var(--text-mono-label)', lineHeight: 'var(--leading-mono-label)', letterSpacing: 'var(--tracking-mono-label)' },
  micro: { fontSize: 'var(--text-mono-micro)', lineHeight: 'var(--leading-mono-micro)', letterSpacing: 'var(--tracking-mono-micro)' },
  tiny: { fontSize: 'var(--text-mono-tiny)', lineHeight: 'var(--leading-mono-tiny)', letterSpacing: 'var(--tracking-mono-tiny)' },
};

/** Uppercase monospace label — the system's data voice. Always uppercase, never above 16px. */
export interface MonoLabelProps extends HTMLAttributes<HTMLSpanElement> {
  /** tiny = 10px, micro = 11px (widest tracking), label = 12px. @default "micro" */
  size?: keyof typeof SIZES;
  /** @default "var(--text-body)" */
  tone?: string;
  /** 400 for annotations, 500 for 12px button-scale labels. @default 400 */
  weight?: 400 | 500;
  children?: ReactNode;
  style?: CSSProperties;
}

export function MonoLabel({ size = 'micro', tone = 'var(--text-body)', weight = 400, children, style, ...rest }: MonoLabelProps) {
  return (
    <span
      style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: weight, color: tone, ...SIZES[size], ...style }}
      {...rest}
    >
      {children}
    </span>
  );
}
