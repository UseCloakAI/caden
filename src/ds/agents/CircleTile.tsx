import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEventHandler, ReactNode } from 'react';
import { AvatarStack } from './AgentAvatar';
import { MonoLabel } from '../core/MonoLabel';
import { DisplayHeadline } from '../core/DisplayHeadline';
import { cx, isLightGround } from '../shared';

/** A group of agents (an office, a circle) as a chromatic tile with its member stack. */
export interface CircleTileProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  /** @default "var(--color-deep-iris)" */
  tone?: string;
  members?: Array<{ name: string; tone?: string }>;
  /** One short line of context. */
  note?: string;
  /** Mono eyebrow. @default "Circle of <members>" */
  countLabel?: string;
  /** Top-right slot, e.g. a Badge or Button. */
  aside?: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
  style?: CSSProperties;
}

export function CircleTile({ name, tone = 'var(--color-deep-iris)', members = [], note, countLabel, aside, onClick, className, style, ...rest }: CircleTileProps) {
  const light = isLightGround(tone);
  const ink = light ? 'var(--color-void)' : 'var(--color-pure)';
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: KeyboardEvent<HTMLDivElement>) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.currentTarget.click()) : undefined}
      className={cx('c-tile', className)}
      data-interactive={onClick ? true : undefined}
      style={{
        background: tone,
        borderRadius: 'var(--radius-categorytiles)',
        padding: 'var(--card-padding)',
        color: ink,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-24)',
        minHeight: 220,
        transition: 'background-color var(--duration-move) var(--ease-out), transform var(--duration-enter) var(--ease-out)',
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-12)' }}>
        <MonoLabel size="micro" tone={ink} style={{ opacity: 0.72 }}>
          {countLabel ?? `Circle of ${members.length}`}
        </MonoLabel>
        {aside ?? (onClick ? <span className="c-tile__arrow" aria-hidden="true" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-subheading)', lineHeight: 1 }}>&#8594;</span> : null)}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        <DisplayHeadline size="card" align="left" as="h3" tone={ink}>{name}</DisplayHeadline>
        {note ? <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body-sm)', color: ink, opacity: 0.8, maxWidth: 440 }}>{note}</p> : null}
        {members.length ? <AvatarStack people={members} size="sm" max={8} ring={light ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.28)'} /> : null}
      </div>
    </div>
  );
}
