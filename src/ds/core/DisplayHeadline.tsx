import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

const SIZES = {
  hero: { fontSize: 'var(--text-display)', lineHeight: 'var(--leading-display)' },
  section: { fontSize: 'var(--text-display-sm)', lineHeight: 'var(--leading-display-sm)' },
  card: { fontSize: 'var(--text-heading-lg)', lineHeight: 'var(--leading-heading-lg)' },
};

/** Whisper-weight serif display headline — the signature voice. Weight 300 by default. */
export interface DisplayHeadlineProps extends HTMLAttributes<HTMLHeadingElement> {
  /** hero = 96px/0.9, section = 80px/1.0, card = 38px/0.9. @default "section" */
  size?: keyof typeof SIZES;
  /** @default "center" */
  align?: 'left' | 'center' | 'right';
  /** Pure white, Cloud, or Void on light grounds. @default "var(--color-pure)" */
  tone?: string;
  as?: 'h1' | 'h2' | 'h3' | 'div';
  children?: ReactNode;
  style?: CSSProperties;
}

export function DisplayHeadline({ size = 'section', align = 'center', tone = 'var(--color-pure)', as: Tag = 'h1', children, style, ...rest }: DisplayHeadlineProps) {
  return (
    <Tag
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 300,
        color: tone,
        textAlign: align,
        margin: 0,
        textWrap: 'pretty',
        ...SIZES[size],
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
