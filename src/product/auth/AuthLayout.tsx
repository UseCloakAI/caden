import type { ReactNode } from 'react';
import { AvatarStack, DisplayHeadline, MonoLabel, SkyField, Subhead, Wordmark } from '@/ds';
import '../product.css';

const FACES = [
  { name: 'Maya', tone: 'var(--color-orchid-bloom)' },
  { name: 'Zeph', tone: 'var(--color-periwinkle)' },
  { name: 'Ora', tone: 'var(--color-iris-gleam)' },
  { name: 'Juno', tone: 'var(--color-deep-iris)' },
];

/** Sky on the left with one line of product truth; the form on the canvas to the right. Stacks under 900px. */
export function AuthLayout({ title, subtitle, children, aside }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="p-auth">
      <SkyField grain={0.36} drift fade="0%" className="p-auth__sky">
        <div className="p-auth__sky-inner">
          <a href="#/" aria-label="Caden home" className="p-auth__brand">
            <Wordmark size={28} />
          </a>
          <div className="p-auth__story c-enter" style={{ animationDelay: '300ms' }}>
            <AvatarStack people={FACES} size="md" ring="rgba(15,16,17,0.5)" />
            <p className="p-auth__quote">Maya asked Zeph about the car. Zeph moved the booking. <em>Nobody sent a message.</em></p>
            <MonoLabel size="tiny" tone="rgba(245,245,247,0.7)">Agent to agent · The Alvarez house</MonoLabel>
          </div>
        </div>
      </SkyField>
      <main className="p-auth__main">
        <div className="p-auth__panel">
          <div className="p-auth__head">
            <DisplayHeadline size="card" align="left" as="h1" animate={120}>{title}</DisplayHeadline>
            {subtitle ? <Subhead align="left" maxWidth={400} className="c-enter" style={{ animationDelay: '280ms', fontSize: 'var(--text-body-md)' }}>{subtitle}</Subhead> : null}
          </div>
          <div className="p-auth__body c-enter" style={{ animationDelay: '360ms' }}>{children}</div>
          {aside ? <div className="p-auth__aside c-enter" style={{ animationDelay: '480ms' }}>{aside}</div> : null}
        </div>
      </main>
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="p-alert">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="p-alert p-alert--notice">
      {children}
    </p>
  );
}
