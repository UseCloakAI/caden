import type { CSSProperties, SVGAttributes } from 'react';
import {
  Activity, ArrowRight, ArrowUp, Bell, ChevronRight, Clock, Link2, MessageCircle,
  Plus, Search, Settings, Shield, UserPlus, Users, X, type LucideIcon,
} from 'lucide-react';

/** The Lucide monoline set in use across Caden. Add a slug here to make it available. */
const ICONS = {
  activity: Activity,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  bell: Bell,
  'chevron-right': ChevronRight,
  clock: Clock,
  'link-2': Link2,
  'message-circle': MessageCircle,
  plus: Plus,
  search: Search,
  settings: Settings,
  shield: Shield,
  'user-plus': UserPlus,
  users: Users,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

const TONE = { pure: 'var(--color-pure)', ash: 'var(--color-ash)', muted: 'var(--color-fog)', dark: 'var(--color-void)' };

/** Monoline icon from the Lucide set. Icons are never chromatic. */
export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'name'> {
  /** Lucide icon slug, e.g. "users", "arrow-right", "message-circle". */
  name: IconName;
  /** Pixel box. 16 / 20 / 24 only. @default 20 */
  size?: 16 | 20 | 24 | number;
  /** Ink. @default "pure" */
  tone?: keyof typeof TONE;
  style?: CSSProperties;
}

export function Icon({ name, size = 20, tone = 'pure', style, ...rest }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      aria-hidden="true"
      size={size}
      color={TONE[tone]}
      style={{ display: 'block', flex: 'none', ...style }}
      {...rest}
    />
  );
}
