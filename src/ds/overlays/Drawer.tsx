import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../core/Button';
import { MonoLabel } from '../core/MonoLabel';
import { useOverlay } from './useOverlay';

/**
 * Right-hand sheet over a blurred scrim. Slides in, slides out, closes on Escape or a scrim
 * click. Its direct children stagger in.
 */
export interface DrawerProps {
  onClose: () => void;
  /** Mono eyebrow in the sticky header. */
  eyebrow?: ReactNode;
  /** Right side of the header, left of the close button. */
  actions?: ReactNode;
  /** @default 480 */
  width?: number;
  /** Accessible name. */
  label?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Drawer({ onClose, eyebrow, actions, width = 480, label, children, style }: DrawerProps) {
  const { closing, requestClose, panelRef } = useOverlay(onClose, 280);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  return createPortal(
    <div className="c-overlay" data-closing={closing || undefined}>
      <div className="c-scrim" onClick={requestClose} />
      <div ref={panelRef} className="c-drawer" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} style={{ maxWidth: width, ...style }}>
        <div className="c-drawer__head" data-scrolled={scrolled || undefined}>
          {typeof eyebrow === 'string' ? <MonoLabel size="tiny" tone="var(--text-muted)">{eyebrow}</MonoLabel> : eyebrow ?? <span />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-8)' }}>
            {actions}
            <Button variant="glass" icon="x" aria-label="Close" onClick={requestClose} />
          </div>
        </div>
        <div ref={bodyRef} className="c-drawer__body" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
