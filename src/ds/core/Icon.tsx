import type { CSSProperties, SVGAttributes } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, AtSign, Bell, Check, ChevronDown, ChevronRight, Clock, Copy, Eye, EyeOff,
  LogOut, Link2, Mail, Menu, MessageCircle, Minus, MoreHorizontal, PanelRight, Plus, Search, Settings, Shield, Trash2,
  UserPlus, Users, X, type LucideIcon,
} from 'lucide-react';

/** The Lucide monoline set in use across Caden. Add a slug here to make it available. */
const ICONS = {
  activity: Activity,
  'arrow-down': ArrowDown,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  'at-sign': AtSign,
  bell: Bell,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  clock: Clock,
  copy: Copy,
  eye: Eye,
  'eye-off': EyeOff,
  'link-2': Link2,
  'log-out': LogOut,
  mail: Mail,
  menu: Menu,
  'message-circle': MessageCircle,
  minus: Minus,
  more: MoreHorizontal,
  'panel-right': PanelRight,
  plus: Plus,
  search: Search,
  settings: Settings,
  shield: Shield,
  trash: Trash2,
  'user-plus': UserPlus,
  users: Users,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

const TONE = { pure: 'var(--color-pure)', ash: 'var(--color-ash)', muted: 'var(--color-fog)', dark: 'var(--color-void)', current: 'currentColor' };

/** Monoline icon from the Lucide set. Icons are never chromatic. */
export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'name'> {
  /** Lucide icon slug, e.g. "users", "arrow-right", "message-circle". */
  name: IconName;
  /** Pixel box. 16 / 20 / 24 only. @default 20 */
  size?: 16 | 20 | 24 | number;
  /** Ink. `current` inherits the text colour. @default "pure" */
  tone?: keyof typeof TONE;
  /** Stroke width. Lucide's 2 by default; 1.5 reads better at 20px and up. */
  strokeWidth?: number;
  style?: CSSProperties;
}

export function Icon({ name, size = 20, tone = 'pure', strokeWidth, style, ...rest }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      aria-hidden="true"
      size={size}
      color={TONE[tone]}
      strokeWidth={strokeWidth ?? (size >= 20 ? 1.75 : 2)}
      style={{ display: 'block', flex: 'none', ...style }}
      {...rest}
    />
  );
}
