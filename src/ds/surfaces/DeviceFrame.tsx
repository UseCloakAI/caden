import { useRef, type CSSProperties, type HTMLAttributes, type PointerEvent, type ReactNode } from 'react';
import type { StyleVars } from '../shared';

/** Tilted phone frame in Dark Chrome, for product-showcase bands. Placeholder for real renders. */
export interface DeviceFrameProps extends HTMLAttributes<HTMLDivElement> {
  /** Rotation in degrees. @default -6 */
  tilt?: number;
  /** Frame width in px. @default 300 */
  width?: number;
  /** Leans toward the pointer (a few degrees at most). @default false */
  follow?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function DeviceFrame({ tilt = -6, width = 300, follow = false, children, style, ...rest }: DeviceFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!follow || !el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
  };
  const leave = () => {
    ref.current?.style.setProperty('--ry', '0deg');
    ref.current?.style.setProperty('--rx', '0deg');
  };
  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={leave}
      style={{
        position: 'relative',
        background: 'var(--gradient-chrome)',
        borderRadius: 44,
        padding: 10,
        width,
        maxWidth: '100%',
        transform: `perspective(1400px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) rotate(${tilt}deg)`,
        transition: 'transform 1.2s var(--ease-out)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 0 1px rgba(255,255,255,0.05), 0 50px 100px -30px rgba(0,0,0,0.7)',
        ...style,
      } as StyleVars}
      {...rest}
    >
      <div
        style={{
          position: 'relative',
          background: 'var(--surface-canvas)',
          border: 'var(--border-hairline)',
          borderRadius: 34,
          overflow: 'hidden',
          aspectRatio: '9 / 19',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 86, height: 24, borderRadius: 'var(--radius-pill)', background: 'var(--color-void)', zIndex: 3 }} />
        {children}
      </div>
    </div>
  );
}
