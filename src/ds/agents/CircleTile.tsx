import type { CSSProperties, HTMLAttributes, MouseEventHandler } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { MonoLabel } from '../core/MonoLabel';
import { DisplayHeadline } from '../core/DisplayHeadline';
import { isLightGround } from '../shared';

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
  onClick?: MouseEventHandler<HTMLDivElement>;
  style?: CSSProperties;
}

export function CircleTile({ name, tone = 'var(--color-deep-iris)', members = [], note, countLabel, onClick, style, ...rest }: CircleTileProps) {
  const light = isLightGround(tone);
  const ink = light ? 'var(--color-void)' : 'var(--color-pure)';
  return (
    <div
      onClick={onClick}
      style={{
        background: tone,
        borderRadius: 'var(--radius-categorytiles)',
        padding: 'var(--card-padding)',
        color: ink,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-24)',
        minHeight: 220,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      {...rest}
    >
      <MonoLabel size="micro" tone={ink} style={{ opacity: 0.7 }}>
        {countLabel ?? `Circle of ${members.length}`}
      </MonoLabel>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        <DisplayHeadline size="card" align="left" as="h3" tone={ink}>{name}</DisplayHeadline>
        {note ? <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body-sm)', color: ink, opacity: 0.8 }}>{note}</p> : null}
        <div style={{ display: 'flex' }}>
          {members.map((m, i) => (
            <div key={m.name + i} style={{ marginLeft: i === 0 ? 0 : -10 }}>
              <AgentAvatar name={m.name} tone={m.tone} size="sm" style={{ boxShadow: `0 0 0 2px ${light ? '#cfd9ea' : 'rgba(0,0,0,0.25)'}` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
