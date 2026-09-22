import type { ReactNode } from 'react';
import { DisplayHeadline, Panel, SkyField, Subhead, Wordmark } from '@/ds';

/** Sky above, one Graphite card holding the form. */
export function AuthLayout({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-canvas)' }}>
      <SkyField grain={0.36} style={{ minHeight: '100vh' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-32)', padding: 'var(--spacing-60) var(--spacing-16)' }}>
          <a href="#/" aria-label="Caden home">
            <Wordmark size={28} />
          </a>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-12)' }}>
            <DisplayHeadline size="card" as="h1">{title}</DisplayHeadline>
            {subtitle ? <Subhead maxWidth={380}>{subtitle}</Subhead> : null}
          </div>
          <Panel level="card" style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-20)' }}>
            {children}
          </Panel>
        </div>
      </SkyField>
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--color-cloud)' }}>
      {children}
    </p>
  );
}
