import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { DisplayHeadline } from '../core/DisplayHeadline';

/** Silver light card. Breaks the dark rhythm — maximum 1–2 per page. */
export interface InvertedCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Display serif 38px/300 figure, in Void. */
  stat?: ReactNode;
  /** 16px sans supporting line. */
  title?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

export function InvertedCard({ stat, title, children, style, ...rest }: InvertedCardProps) {
  return (
    <div
      style={{
        background: 'var(--surface-inverted)',
        borderRadius: 'var(--radius-categorytiles)',
        padding: 'var(--card-padding)',
        color: 'var(--text-on-light)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-16)',
        ...style,
      }}
      {...rest}
    >
      {stat ? <DisplayHeadline size="card" align="left" as="div" tone="var(--color-void)">{stat}</DisplayHeadline> : null}
      {title ? <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-md)', lineHeight: 'var(--leading-body-md)', color: 'var(--color-void)', margin: 0 }}>{title}</p> : null}
      {children}
    </div>
  );
}
