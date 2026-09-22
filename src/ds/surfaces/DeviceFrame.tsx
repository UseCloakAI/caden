import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/** Tilted phone frame in Dark Chrome, for product-showcase bands. Placeholder for real renders. */
export interface DeviceFrameProps extends HTMLAttributes<HTMLDivElement> {
  /** Rotation in degrees. @default -6 */
  tilt?: number;
  /** Frame width in px. @default 300 */
  width?: number;
  children?: ReactNode;
  style?: CSSProperties;
}

export function DeviceFrame({ tilt = -6, width = 300, children, style, ...rest }: DeviceFrameProps) {
  return (
    <div
      style={{
        background: 'var(--gradient-chrome)',
        borderRadius: 40,
        padding: 10,
        width,
        transform: `rotate(${tilt}deg)`,
        transition: 'transform var(--duration-reveal) var(--ease-atmosphere)',
        ...style,
      }}
      {...rest}
    >
      <div
        style={{
          background: 'var(--surface-canvas)',
          border: 'var(--border-hairline)',
          borderRadius: 32,
          overflow: 'hidden',
          aspectRatio: '9 / 19',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  );
}
