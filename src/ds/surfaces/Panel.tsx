import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

const LEVELS: Record<NonNullable<PanelProps['level']>, CSSProperties> = {
  canvas: { background: 'var(--surface-canvas)', border: 'var(--border-hairline)', color: 'var(--text-body)' },
  sunken: { background: 'var(--surface-sunken)', border: '1px solid transparent', color: 'var(--text-body)' },
  card: { background: 'var(--surface-card)', border: '1px solid transparent', color: 'var(--text-body)' },
  chrome: { background: 'var(--gradient-chrome)', border: '1px solid transparent', color: 'var(--text-body)' },
};

/** Dark surface container. Elevation is a color step, never a shadow. */
export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** canvas = Obsidian + hairline, sunken = Abyss, card = Graphite, chrome = Dark Chrome gradient. @default "card" */
  level?: 'canvas' | 'sunken' | 'card' | 'chrome';
  /** @default "var(--radius-cards)" */
  radius?: string;
  /** @default "var(--card-padding)" */
  padding?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Panel({ level = 'card', radius = 'var(--radius-cards)', padding = 'var(--card-padding)', children, style, ...rest }: PanelProps) {
  return (
    <div style={{ borderRadius: radius, padding, ...LEVELS[level], ...style }} {...rest}>
      {children}
    </div>
  );
}
