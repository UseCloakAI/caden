import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';

const RADII = { bar: 28, card: 26, pill: 9999, button: 22, sheet: 38 };

const SPECULAR = 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.06)';

/**
 * Liquid-glass surface for chrome that floats over content — bars, sheets, pills, floating
 * controls. Never for page-level cards (those stay flat Graphite).
 */
export interface GlassSurfaceProps extends HTMLAttributes<HTMLElement> {
  /** @default "div" */
  as?: ElementType;
  /** Radius preset: bar 28 · card 26 · pill full · button 22 · sheet 38. @default "card" */
  variant?: keyof typeof RADII;
  /** Explicit radius override in px. */
  radius?: number;
  /** White tint. 0.10 rest, 0.18–0.20 active. @default "rgba(255,255,255,0.10)" */
  tint?: string;
  /** Blur radius in px. @default 24 */
  blur?: number;
  padding?: string | number;
  /** Adds the system's single shadow token — detached floating chrome only. @default false */
  floating?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function GlassSurface({
  as: Tag = 'div',
  variant = 'card',
  radius,
  tint = 'rgba(255,255,255,0.10)',
  blur = 24,
  padding,
  floating = false,
  children,
  style,
  ...rest
}: GlassSurfaceProps) {
  const filter = `blur(${blur}px) saturate(180%)`;
  return (
    <Tag
      style={{
        position: 'relative',
        background: tint,
        backdropFilter: filter,
        WebkitBackdropFilter: filter,
        border: 'var(--border-glass)',
        borderRadius: radius ?? RADII[variant],
        padding: padding ?? (variant === 'pill' ? '8px 14px' : 'var(--spacing-16)'),
        boxShadow: floating ? `${SPECULAR}, var(--shadow-lg)` : SPECULAR,
        color: 'var(--color-cloud)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
