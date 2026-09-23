import type { CSSProperties, ElementType, ReactNode, ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from '../shared';

type Variant = 'primary' | 'ghost' | 'glass' | 'pill' | 'text';

/** Caden action button. White-on-black `primary` is the only true primary action on a page. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = white fill (one per view). ghost = 1px white outline. glass = frosted nav item. pill = compact chip. text = quiet link. @default "primary" */
  variant?: Variant;
  /** sm = compact toolbar, md = default, lg = hero CTA. @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Trailing arrow glyph; slides on hover. Spec pairs it with every primary CTA. @default false */
  arrow?: boolean;
  /** Leading Lucide icon slug. With no children the button becomes a square icon button. */
  icon?: IconName;
  disabled?: boolean;
  /** Keeps the button's width and swaps the label for a spinner. @default false */
  loading?: boolean;
  /** Fill the container's width. @default false */
  block?: boolean;
  /** Toggle state for pill and glass buttons (renders aria-pressed; pressed pills go white). */
  pressed?: boolean;
  /** Render as another element. Passing `href` renders an anchor automatically. */
  as?: ElementType;
  href?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Button({ variant = 'primary', size = 'md', arrow = false, icon, disabled = false, loading = false, block = false, pressed, as, children, className, style, ...rest }: ButtonProps) {
  const Tag: ElementType = as || (rest.href ? 'a' : 'button');
  const iconOnly = icon && children == null && !arrow;
  const ink = variant === 'primary' || (pressed && variant === 'pill') ? 'dark' : 'pure';
  return (
    <Tag
      className={cx('c-btn', `c-btn--${variant}`, size !== 'md' && `c-btn--${size}`, iconOnly && 'c-btn--icon', block && 'c-btn--block', className)}
      style={style}
      disabled={Tag === 'button' ? disabled || loading : undefined}
      aria-disabled={Tag !== 'button' && disabled ? true : undefined}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      type={Tag === 'button' && !rest.type ? 'button' : undefined}
      {...rest}
    >
      <span className="c-btn__label">
        {icon ? <Icon name={icon} size={16} tone={ink} /> : null}
        {children}
        {arrow ? <span className="c-btn__arrow" aria-hidden="true">&#8594;</span> : null}
      </span>
      {loading ? (
        <span className="c-btn__spinner" aria-hidden="true">
          <span className="c-spinner" />
        </span>
      ) : null}
    </Tag>
  );
}
