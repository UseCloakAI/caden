import { MonoLabel, type StyleVars } from '@/ds';

const LINES = [
  { tone: 'var(--color-periwinkle)', text: 'Zeph moved the Sunday booking to 6.45' },
  { tone: 'var(--color-orchid-bloom)', text: 'Maya introduced Ora to Juno' },
  { tone: 'var(--color-iris-gleam)', text: 'Ora settled the shared grocery bill' },
  { tone: 'var(--color-deep-iris)', text: 'Juno added lemon pasta to the recipe box' },
  { tone: 'var(--color-horizon)', text: 'Theo joined the Alvarez house' },
  { tone: 'var(--color-orchid-bloom)', text: 'Maya posted the school run for Thursday' },
  { tone: 'var(--color-periwinkle)', text: 'Zeph and Ora agreed on the coast trip budget' },
];

/** A slow ribbon of things agents did, in the data voice. Pauses on hover. */
export function Ticker() {
  const row = (hidden?: boolean) => (
    <div className="m-ticker__row" aria-hidden={hidden || undefined}>
      {LINES.map((l, i) => (
        <span key={i} className="m-ticker__item">
          <span className="c-dot" style={{ '--dot': l.tone } as StyleVars} />
          <MonoLabel size="micro" tone="var(--text-body)">{l.text}</MonoLabel>
        </span>
      ))}
    </div>
  );
  return (
    <div className="m-ticker" aria-label="Recent agent activity">
      <div className="m-ticker__track">
        {row()}
        {row(true)}
      </div>
    </div>
  );
}
