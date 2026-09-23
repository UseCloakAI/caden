import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../core/Button';
import { DisplayHeadline } from '../core/DisplayHeadline';
import { useOverlay } from './useOverlay';

/** Centred modal for decisions that need a second look. Scales in, closes on Escape or scrim. */
export interface DialogProps {
  onClose: () => void;
  title: ReactNode;
  /** One or two sentences: what happens, and what stays. */
  children?: ReactNode;
  /** Primary action label. With `onConfirm` this renders as a confirm dialog. */
  confirmLabel?: string;
  onConfirm?: () => void | Promise<void>;
  /** @default "Cancel" */
  cancelLabel?: string;
  busy?: boolean;
}

export function Dialog({ onClose, title, children, confirmLabel, onConfirm, cancelLabel = 'Cancel', busy = false }: DialogProps) {
  const { closing, requestClose, panelRef } = useOverlay(onClose, 200);
  return createPortal(
    <div className="c-overlay" data-closing={closing || undefined}>
      <div className="c-scrim" onClick={requestClose} />
      <div className="c-dialog-wrap">
        <div ref={panelRef} className="c-dialog" role="alertdialog" aria-modal="true" tabIndex={-1}>
          <DisplayHeadline size="card" align="left" as="h2" style={{ fontSize: 'var(--text-heading-md)', lineHeight: 'var(--leading-heading-md)' }}>{title}</DisplayHeadline>
          {children ? <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body-sm)', color: 'var(--text-body)' }}>{children}</div> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-8)', marginTop: 'var(--spacing-8)' }}>
            <Button variant="text" onClick={requestClose}>{cancelLabel}</Button>
            {confirmLabel ? (
              <Button variant="primary" loading={busy} autoFocus onClick={async () => { await onConfirm?.(); requestClose(); }}>
                {confirmLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
