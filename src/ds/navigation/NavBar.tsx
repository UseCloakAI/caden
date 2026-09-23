import { useEffect, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Wordmark } from '../core/Wordmark';
import { Icon } from '../core/Icon';
import { cx, useScrolled } from '../shared';

/** Sticky glass top bar — wordmark, mono nav items, one primary CTA flush right. Collapses to a menu under 820px. */
export interface NavBarProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  /** Nav labels, rendered as mono uppercase items (and as large serif links in the mobile menu). */
  items?: string[];
  active?: string;
  onSelect?: (item: string) => void;
  /** Right-hand cluster — a text log-in link plus one primary Button. Add `c-nav__hide-sm` to hide a child on phones. */
  trailing?: ReactNode;
  /** Pinned to the bottom of the mobile menu, e.g. log-in and sign-up buttons. */
  menuFooter?: ReactNode;
  /** Where the wordmark links. @default "#/" */
  brandHref?: string;
  /** Replaces the wordmark. */
  brand?: ReactNode;
  /** Opaque from the start instead of only once the page scrolls. @default false */
  solid?: boolean;
  style?: CSSProperties;
}

export function NavBar({ items = [], active, onSelect, trailing, menuFooter, brandHref = '#/', brand, solid = false, className, style, ...rest }: NavBarProps) {
  const scrolled = useScrolled(12);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 200);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <nav className={cx('c-nav', className)} data-scrolled={scrolled || open || undefined} data-solid={solid || undefined} style={style} {...rest}>
        {brand ?? (
          <a href={brandHref} aria-label="Caden home" style={{ display: 'inline-flex', alignItems: 'center', position: 'relative', zIndex: 41 }}>
            <Wordmark size={24} />
          </a>
        )}
        {items.length ? (
          <div className="c-nav__items">
            {items.map((item) => (
              <button key={item} type="button" className="c-nav__item" aria-current={active === item || undefined} onClick={() => onSelect?.(item)}>
                {item}
              </button>
            ))}
          </div>
        ) : null}
        <div className="c-nav__trailing">
          {trailing}
          {items.length || menuFooter ? (
            <button
              type="button"
              className="c-btn c-btn--glass c-btn--icon c-nav__menu-btn"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => (open ? close() : setOpen(true))}
              style={{ position: 'relative', zIndex: 41 }}
            >
              <Icon name={open ? 'x' : 'menu'} size={18} />
            </button>
          ) : null}
        </div>
      </nav>
      {open
        ? createPortal(
            <div className="c-nav__sheet" data-closing={closing || undefined} role="dialog" aria-label="Menu">
              {items.map((item, i) => (
                <button
                  key={item}
                  type="button"
                  className="c-nav__sheet-link"
                  style={{ ['--i' as string]: i }}
                  onClick={() => {
                    close();
                    onSelect?.(item);
                  }}
                >
                  {item}
                  <Icon name="arrow-right" size={20} tone="muted" />
                </button>
              ))}
              {menuFooter ? (
                <div onClick={close} style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)', animation: 'cadenFadeUp var(--duration-enter) var(--ease-out) 0.25s both' }}>
                  {menuFooter}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
