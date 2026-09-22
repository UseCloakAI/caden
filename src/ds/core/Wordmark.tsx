import type { CSSProperties, HTMLAttributes } from 'react';

/** The Caden wordmark. No logo file exists yet, so the mark is live type. */
export interface WordmarkProps extends HTMLAttributes<HTMLSpanElement> {
  /** Cap size in px. @default 20 */
  size?: number;
  /** @default "var(--text-primary)" */
  tone?: string;
  style?: CSSProperties;
}

export function Wordmark({ size = 20, tone = 'var(--text-primary)', style, ...rest }: WordmarkProps) {
  return (
    <span
      style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: size, lineHeight: 1, letterSpacing: '0.01em', color: tone, ...style }}
      {...rest}
    >
      Caden
    </span>
  );
}
