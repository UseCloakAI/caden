import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Open overlays, innermost last — only the top one answers Escape. */
const stack: symbol[] = [];

/**
 * Shared overlay behaviour: plays the exit animation before `onClose`, closes on Escape,
 * moves focus into the panel and hands it back afterwards, and locks page scroll.
 */
export function useOverlay(onClose: () => void, exitMs = 260) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  const requestClose = useCallback(() => {
    setClosing((was) => {
      if (!was) setTimeout(() => closeRef.current(), exitMs);
      return true;
    });
  }, [exitMs]);

  useEffect(() => {
    const me = Symbol('overlay');
    stack.push(me);
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea:not([disabled])');
      (first ?? panel).focus({ preventScroll: true });
    }, 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      stack.splice(stack.indexOf(me), 1);
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [requestClose]);

  return { closing, requestClose, panelRef };
}
