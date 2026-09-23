import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Words } from '../motion/Reveal';

const SIZES = {
  hero: { fontSize: 'var(--text-display)', lineHeight: 'var(--leading-display)' },
  section: { fontSize: 'var(--text-display-sm)', lineHeight: 'var(--leading-display-sm)' },
  card: { fontSize: 'var(--text-heading-lg)', lineHeight: 'var(--leading-heading-lg)' },
};

/** Whisper-weight serif display headline — the signature voice. Weight 300 by default. */
export interface DisplayHeadlineProps extends HTMLAttributes<HTMLHeadingElement> {
  /** hero = 52–104px fluid, section = 42–80px fluid, card = 30–38px. @default "section" */
  size?: keyof typeof SIZES;
  /** @default "center" */
  align?: 'left' | 'center' | 'right';
  /** Pure white, Cloud, or Void on light grounds. @default "var(--color-pure)" */
  tone?: string;
  as?: 'h1' | 'h2' | 'h3' | 'div';
  /** Words rise out of a mask one after another. Pass a number to delay the start (ms). @default false */
  animate?: boolean | number;
  children?: ReactNode;
  style?: CSSProperties;
}

export function DisplayHeadline({ size = 'section', align = 'center', tone = 'var(--color-pure)', as: Tag = 'h1', animate = false, children, style, ...rest }: DisplayHeadlineProps) {
  return (
    <Tag
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 300,
        color: tone,
        textAlign: align,
        margin: 0,
        textWrap: 'balance',
        letterSpacing: size === 'card' ? '-0.005em' : '-0.015em',
        ...SIZES[size],
        ...style,
      }}
      {...rest}
    >
      {animate === false ? children : <Words delay={typeof animate === 'number' ? animate : 0}>{children}</Words>}
    </Tag>
  );
}
