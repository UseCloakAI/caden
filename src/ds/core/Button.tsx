import type { CSSProperties, ElementType, ReactNode, ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import { useHover } from '../shared';

type Variant = 'primary' | 'ghost' | 'glass' | 'pill' | 'text';

const BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--spacing-8)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-body-md)',
  fontWeight: 400,
  lineHeight: 1,
  border: '1px solid transparent',
  borderRadius: 'var(--radius-buttons)',
  padding: '12px 18px',
  cursor: 'pointer',
  transition: 'var(--transition-state)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--action-fill)', color: 'var(--action-fill-text)', borderColor: 'transparent' },
  ghost: { background: 'transparent', color: 'var(--text-primary)', borderColor: 'var(--color-pure)' },
  glass: { background: 'var(--surface-glass)', color: 'var(--text-primary)', borderColor: 'rgba(255,255,255,0.15)', padding: '9px 12px' },
  pill: { background: 'var(--surface-glass-strong)', color: 'var(--text-primary)', borderColor: 'rgba(255,255,255,0.3)', borderRadius: 'var(--radius-pill)', padding: '4px 12px', fontSize: 'var(--text-body-sm)' },
  text: { background: 'transparent', color: 'var(--text-body)', borderColor: 'transparent', padding: '12px 8px' },
};

const HOVER: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--action-fill-hover)' },
  ghost: { background: 'rgba(255,255,255,0.08)' },
  glass: { background: 'var(--surface-glass-strong)' },
  pill: { background: 'rgba(255,255,255,0.3)' },
  text: { color: 'var(--text-primary)' },
};

/** Caden action button. White-on-black `primary` is the only true primary action on a page. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = white fill (one per view). ghost = 1px white outline. glass = frosted nav item. pill = compact chip. text = quiet link. @default "primary" */
  variant?: Variant;
  /** Trailing arrow glyph. Spec pairs it with every primary CTA. @default false */
  arrow?: boolean;
  /** Leading Lucide icon slug. */
  icon?: IconName;
  disabled?: boolean;
  /** Render as another element. Passing `href` renders an anchor automatically. */
  as?: ElementType;
  href?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Button({ variant = 'primary', arrow = false, icon, disabled = false, as, children, style, ...rest }: ButtonProps) {
  const { hover, bind } = useHover();
  const Tag: ElementType = as || (rest.href ? 'a' : 'button');
  return (
    <Tag
      style={{
        ...BASE,
        ...VARIANTS[variant],
        ...(hover && !disabled ? HOVER[variant] : null),
        ...(disabled ? { opacity: 0.4, cursor: 'not-allowed' } : null),
        ...style,
      }}
      disabled={Tag === 'button' ? disabled : undefined}
      {...bind}
      {...rest}
    >
      {icon ? <Icon name={icon} size={16} tone={variant === 'primary' ? 'dark' : 'pure'} /> : null}
      {children}
      {arrow ? <span style={{ fontFamily: 'var(--font-sans)', lineHeight: 1 }}>&#8594;</span> : null}
    </Tag>
  );
}
