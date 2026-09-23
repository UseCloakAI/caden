import type { ReactNode } from 'react';

/** Animates its content's height open and closed. Closed content is inert. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const inert = open ? {} : ({ inert: '' } as Record<string, string>);
  return (
    <div className="c-collapse" data-open={open || undefined} aria-hidden={!open} {...inert}>
      <div>{children}</div>
    </div>
  );
}
