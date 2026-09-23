import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/** Chromatic grounds light enough that ink flips to Void. */
export const LIGHT_GROUNDS = ['var(--color-pale-iris)', 'var(--color-periwinkle)', 'var(--color-orchid-bloom)'];

export const isLightGround = (tone?: string) => tone != null && LIGHT_GROUNDS.includes(tone);

/** Join class names, skipping falsy ones. */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/** CSS custom properties are valid style keys; React's types just don't know it. */
export type StyleVars = CSSProperties & Record<`--${string}`, string | number>;

export function useHover() {
  const [hover, setHover] = useState(false);
  return { hover, bind: { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } };
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * True once the element has scrolled into view (and stays true with `once`). Falls back to
 * true where IntersectionObserver is missing or motion is reduced.
 */
export function useInView<T extends Element>(options: { once?: boolean; margin?: string; threshold?: number } = {}): [RefObject<T>, boolean] {
  const { once = true, margin = '0px 0px -12% 0px', threshold = 0.15 } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined' || reducedMotion());
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || reducedMotion()) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { rootMargin: margin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, margin, threshold]);
  return [ref, inView];
}

/**
 * A sliding selection indicator: measures the active child inside `container` and returns
 * its offset and size. Measurement runs in a ResizeObserver callback, which fires once on
 * observe (before paint) and again whenever the container resizes.
 */
export function useIndicator(container: RefObject<HTMLElement | null>, activeKey: string | undefined, axis: 'x' | 'y' = 'x') {
  const [box, setBox] = useState<{ offset: number; size: number; ready: boolean }>({ offset: 0, size: 0, ready: false });
  useLayoutEffect(() => {
    const root = container.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const el = activeKey == null ? null : root.querySelector<HTMLElement>(`[data-key="${CSS.escape(activeKey)}"]`);
      if (!el) {
        setBox((b) => (b.size ? { ...b, size: 0 } : b));
        return;
      }
      const offset = axis === 'x' ? el.offsetLeft : el.offsetTop;
      const size = axis === 'x' ? el.offsetWidth : el.offsetHeight;
      setBox((b) => (b.offset === offset && b.size === size ? b : { offset, size, ready: b.ready || size > 0 }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [container, activeKey, axis]);
  return box;
}

/** True once the page (or a scroll container) has scrolled past `threshold` px. */
export function useScrolled(threshold = 8, target?: RefObject<HTMLElement | null>) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el: HTMLElement | Window = target?.current ?? window;
    const read = () => setScrolled((el instanceof Window ? el.scrollY : el.scrollTop) > threshold);
    read();
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [threshold, target]);
  return scrolled;
}

/** Media query as state. */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
