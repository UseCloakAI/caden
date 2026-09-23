import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../core/Icon';

interface ToastItem {
  id: number;
  message: string;
  icon: IconName;
  closing: boolean;
}

type Toast = (message: string, options?: { icon?: IconName; duration?: number }) => void;

const ToastContext = createContext<Toast | null>(null);

/** Glass pills that rise from the bottom edge, confirm something happened, and leave. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, closing: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 240);
  }, []);

  const toast = useCallback<Toast>(
    (message, options = {}) => {
      const id = ++next.current;
      setItems((list) => [...list.filter((t) => t.message !== message).slice(-2), { id, message, icon: options.icon ?? 'check', closing: false }]);
      setTimeout(() => dismiss(id), options.duration ?? 3200);
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="c-toasts" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className="c-toast" data-closing={t.closing || undefined} onClick={() => dismiss(t.id)}>
              <span className="c-toast__icon">
                <Icon name={t.icon} size={14} tone="dark" strokeWidth={2.5} />
              </span>
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/** `toast("Saved.")`. Outside a ToastProvider it is a no-op. */
export function useToast(): Toast {
  return useContext(ToastContext) ?? (() => {});
}
