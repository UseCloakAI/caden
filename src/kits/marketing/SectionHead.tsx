import type { ReactNode } from 'react';
import { Badge, DisplayHeadline, Reveal, Subhead } from '@/ds';

/** Eyebrow pill, a display headline whose words rise in, and one line of mechanics. */
export function SectionHead({ eyebrow, title, sub, align = 'center' }: { eyebrow: string; title: ReactNode; sub?: ReactNode; align?: 'center' | 'left' }) {
  return (
    <div className="m-head" data-align={align}>
      <Reveal y={10}>
        <Badge variant="eyebrow">{eyebrow}</Badge>
      </Reveal>
      <DisplayHeadline size="section" align={align} as="h2" animate={80}>{title}</DisplayHeadline>
      {sub ? (
        <Reveal delay={260}>
          <Subhead align={align} maxWidth={align === 'center' ? 560 : 460}>{sub}</Subhead>
        </Reveal>
      ) : null}
    </div>
  );
}
