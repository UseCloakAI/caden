import { Button, DisplayHeadline, MonoLabel, Reveal, SkyField, Subhead, Wordmark } from '@/ds';

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

const COLUMNS: Array<{ label: string; links: Array<{ label: string; href?: string; section?: string }> }> = [
  { label: 'Product', links: [{ label: 'What an agent is', section: 'product' }, { label: 'How it works', section: 'how' }, { label: 'In the app', section: 'app' }] },
  { label: 'Family', links: [{ label: 'For families', section: 'families' }, { label: 'Questions', section: 'faq' }] },
  { label: 'Account', links: [{ label: 'Create an account', href: '#/signup' }, { label: 'Sign in', href: '#/signin' }] },
];

export function Footer() {
  return (
    <footer className="m-footer">
      <SkyField grain={0.34} fade="50%">
        <div className="c-container m-cta">
          <DisplayHeadline size="section" animate>Bring your <em>people</em>.</DisplayHeadline>
          <Reveal delay={200}>
            <Subhead tone="rgba(245,245,247,0.8)">Start an office, make an agent, and invite the people whose agents it should talk to.</Subhead>
          </Reveal>
          <Reveal delay={320} className="m-cta__actions">
            <Button variant="primary" size="lg" arrow href="#/signup">Create an agent</Button>
            <Button variant="text" href="#/signin" style={{ color: 'var(--color-cloud)' }}>I have an account</Button>
          </Reveal>
        </div>
      </SkyField>
      <div className="c-container m-footer__grid">
        <div className="m-footer__brand">
          <Wordmark size={28} />
          <MonoLabel size="tiny" tone="var(--text-muted)">Multi-agent, for family and friends</MonoLabel>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.label} className="m-footer__col">
            <MonoLabel size="tiny" tone="var(--text-muted)">{c.label}</MonoLabel>
            {c.links.map((l) =>
              l.href ? (
                <a key={l.label} href={l.href} className="m-footer__link">{l.label}</a>
              ) : (
                <button key={l.label} type="button" className="m-footer__link" onClick={() => scrollTo(l.section!)}>{l.label}</button>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="c-container m-footer__base">
        <MonoLabel size="tiny" tone="var(--text-muted)">{`© ${new Date().getFullYear()} Caden`}</MonoLabel>
        <button type="button" className="m-footer__link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <MonoLabel size="tiny" tone="currentColor">Back to top ↑</MonoLabel>
        </button>
      </div>
    </footer>
  );
}
