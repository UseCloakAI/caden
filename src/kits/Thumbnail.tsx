const STRIP = ['var(--color-pale-iris)', 'var(--color-orchid-bloom)', 'var(--color-periwinkle)', 'var(--color-deep-iris)'];

/** Homepage tile for the design system — 1280×854. */
export function Thumbnail() {
  return (
    <div style={{ width: 1280, height: 854, overflow: 'hidden', display: 'flex' }}>
      <div style={{ flex: 1, background: 'var(--color-iris-gleam)', display: 'grid', placeItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 210, lineHeight: 1, color: 'var(--color-pure)', letterSpacing: '0.01em' }}>Caden</span>
      </div>
      <div style={{ width: 300, display: 'flex', flexDirection: 'column' }}>
        {STRIP.map((tone) => <div key={tone} style={{ flex: 1, background: tone }} />)}
      </div>
    </div>
  );
}
