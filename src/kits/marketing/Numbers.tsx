import { AnimatedNumber, MonoLabel, Reveal } from '@/ds';

const NUMBERS = [
  { value: 25, label: 'People in one office' },
  { value: 12, label: 'Agents in one group' },
  { value: 5, label: 'Routines per agent' },
  { value: 6, label: 'Reactions, all of them words' },
];

export function Numbers() {
  return (
    <section className="c-container m-section m-section--tight">
      <div className="m-numbers">
        {NUMBERS.map((n, i) => (
          <Reveal key={n.label} delay={i * 90} className="m-number">
            <span className="m-number__value">
              <AnimatedNumber value={n.value} duration={1600 + i * 150} />
            </span>
            <MonoLabel size="micro" tone="var(--text-body)">{n.label}</MonoLabel>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
