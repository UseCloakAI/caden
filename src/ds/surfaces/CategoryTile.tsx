import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../core/Icon';
import { DisplayHeadline } from '../core/DisplayHeadline';
import { cx, isLightGround } from '../shared';

/** Full-bleed chromatic tile — the only legal use of the accent palette. */
export interface CategoryTileProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Chromatic token. Ink flips to Void on light grounds. @default "var(--color-iris-gleam)" */
  tone?: string;
  /** Lucide icon slug, 24px top-left. */
  icon?: IconName;
  /** Display serif 38px/300 title. */
  title?: ReactNode;
  /** 16px sans description. */
  description?: ReactNode;
  /** Illustration slot between the icon and the title — live product fragments, never pictures. */
  visual?: ReactNode;
  footer?: ReactNode;
  /** Lift on hover. @default false */
  interactive?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function CategoryTile({ tone = 'var(--color-iris-gleam)', icon, title, description, visual, footer, interactive = false, children, className, style, ...rest }: CategoryTileProps) {
  const light = isLightGround(tone);
  const ink = light ? 'var(--color-void)' : 'var(--color-pure)';
  return (
    <div
      className={cx('c-tile', className)}
      data-interactive={interactive || undefined}
      style={{
        background: tone,
        borderRadius: 'var(--radius-categorytiles)',
        padding: 'var(--card-padding)',
        color: ink,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-20)',
        minHeight: 240,
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={24} tone={light ? 'dark' : 'pure'} className="c-tile__icon" /> : null}
      {visual ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: 0 }}>{visual}</div> : null}
      <div style={{ marginTop: visual ? 0 : 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
        {title ? <DisplayHeadline size="card" align="left" as="h3" tone={ink}>{title}</DisplayHeadline> : null}
        {description ? (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-md)', lineHeight: 'var(--leading-body-md)', color: ink, opacity: light ? 0.75 : 0.82, margin: 0, maxWidth: 340 }}>{description}</p>
        ) : null}
        {footer}
        {children}
      </div>
    </div>
  );
}
