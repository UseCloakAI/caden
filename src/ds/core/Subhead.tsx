import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/** Supporting 18px/300 sans text under headlines and card titles. */
export interface SubheadProps extends HTMLAttributes<HTMLParagraphElement> {
  /** @default "var(--text-body)" */
  tone?: string;
  /** @default "center" */
  align?: 'left' | 'center';
  /** @default 560 */
  maxWidth?: number | string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Subhead({ tone = 'var(--text-body)', align = 'center', maxWidth = 560, children, style, ...rest }: SubheadProps) {
  return (
    <p
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-subheading)',
        lineHeight: 'var(--leading-subheading)',
        fontWeight: 300,
        color: tone,
        textAlign: align,
        maxWidth,
        margin: align === 'center' ? '0 auto' : 0,
        textWrap: 'pretty',
        ...style,
      }}
      {...rest}
    >
      {children}
    </p>
  );
}
