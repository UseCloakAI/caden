import { Button, DisplayHeadline, MonoLabel, Subhead, Wordmark } from '@/ds';

const COLUMNS = [
  { label: 'Product', links: ['Agents', 'Circles', 'Contact', 'Pricing'] },
  { label: 'Family', links: ['Household plan', 'For friends', 'Safety'] },
  { label: 'Company', links: ['About', 'Careers', 'Contact us'] },
];

export function Footer() {
  return (
    <footer style={{ background: 'var(--surface-sunken)', borderTop: 'var(--border-hairline)', marginTop: 'var(--section-gap)' }}>
      <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto', padding: 'var(--spacing-100) var(--spacing-32)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-100)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-24)' }}>
          <DisplayHeadline size="section">Bring your <em>people</em>.</DisplayHeadline>
          <Subhead>Six agents, one household, one bill. Cancel whenever the plans stop needing them.</Subhead>
          <Button variant="primary" arrow href="#/signup">Create an agent</Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(3, 1fr)', gap: 'var(--spacing-40)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
            <Wordmark size={22} />
            <MonoLabel size="tiny" tone="var(--text-muted)">Multi-agent, for family and friends</MonoLabel>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
              <MonoLabel size="tiny" tone="var(--text-muted)">{c.label}</MonoLabel>
              {c.links.map((l) => (
                <a key={l} href="#" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--text-body)', textDecoration: 'none' }}>{l}</a>
              ))}
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
