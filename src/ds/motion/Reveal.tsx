import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type CSSProperties, type ElementType, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { cx, useInView, type StyleVars } from '../shared';

/** Fades and lifts its content in the first time it scrolls into view. */
export interface RevealProps extends HTMLAttributes<HTMLElement> {
  /** @default "div" */
  as?: ElementType;
  /** Milliseconds to wait after entering view. @default 0 */
  delay?: number;
  /** Starting offset in px. @default 18 */
  y?: number;
  /** Start slightly blurred and sharpen as it lands. For headlines only. @default false */
  blur?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Reveal({ as: Tag = 'div', delay = 0, y = 18, blur = false, className, style, children, ...rest }: RevealProps) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref}
      className={cx('c-reveal', inView && 'is-in', className)}
      data-blur={blur || undefined}
      style={{ '--reveal-delay': `${delay}ms`, '--reveal-y': `${y}px`, ...style } as StyleVars}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Splits text into words that rise out of a mask one after another, once they scroll into
 * view. Walks nested elements (`<em>`, `<br />`) so headline markup survives.
 */
export function Words({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const [ref, inView] = useInView<HTMLSpanElement>({ margin: '0px 0px -6% 0px', threshold: 0 });
  let index = 0;
  const walk = (node: ReactNode): ReactNode =>
    Children.map(node, (child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child)
          .split(/(\s+)/)
          .map((part, i) => {
            if (!part) return null;
            if (/^\s+$/.test(part)) return ' ';
            const n = index++;
            return (
              <span key={`${n}-${i}`} className="c-word">
                <span style={{ '--i': n } as StyleVars}>{part}</span>
              </span>
            );
          });
      }
      if (isValidElement(child)) {
        const el = child as ReactElement<{ children?: ReactNode }>;
        if (el.props.children == null) return el;
        return cloneElement(el, undefined, walk(el.props.children));
      }
      return child;
    });
  return (
    <span ref={ref} className="c-words" data-paused={inView ? undefined : true} style={{ '--words-delay': `${delay}ms` } as StyleVars}>
      {walk(children)}
    </span>
  );
}

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

/** Counts from 0 to `value` the first time it scrolls into view, then follows changes. */
export function AnimatedNumber({ value, duration = 1400, format = (n: number) => Math.round(n).toLocaleString(), style }: { value: number; duration?: number; format?: (n: number) => string; style?: CSSProperties }) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = origin + (value - origin) * easeOutExpo(t);
      setShown(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  return (
    <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums', ...style }} aria-label={format(value)}>
      {format(shown)}
    </span>
  );
}
