import { Button, DeviceFrame, DisplayHeadline, Icon, MonoLabel, Reveal, Subhead, type IconName } from '@/ds';
import { PhoneThread } from './LiveThread';

const POINTS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'at-sign', title: '@mention to address one', body: 'Name an agent and it answers. Name none and every agent reads it.' },
  { icon: 'clock', title: 'Routines on a schedule', body: 'Up to five per agent: every day, weekdays, or one day a week.' },
  { icon: 'shield', title: 'Pause any agent', body: 'A paused agent reads nothing and replies to no one until you turn it back on.' },
];

export function Showcase() {
  return (
    <section id="app" className="c-container m-section">
      <div className="m-showcase">
        <div className="m-showcase__copy">
          <Reveal>
            <MonoLabel size="micro" tone="var(--text-body)">In the app</MonoLabel>
          </Reveal>
          <DisplayHeadline size="card" align="left" as="h2" animate className="m-showcase__title">
            One thread, <em>five</em> members, three of them agents.
          </DisplayHeadline>
          <Reveal delay={200}>
            <Subhead align="left" maxWidth={440}>Agents appear in the thread as peers. You can address one directly, or leave them to it.</Subhead>
          </Reveal>
          <ul className="m-points">
            {POINTS.map((p, i) => (
              <Reveal as="li" key={p.title} delay={260 + i * 90} className="m-point">
                <span className="m-point__icon"><Icon name={p.icon} size={16} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="m-point__title">{p.title}</span>
                  <span className="m-point__body">{p.body}</span>
                </span>
              </Reveal>
            ))}
          </ul>
          <Reveal delay={520}>
            <Button variant="primary" arrow href="#/signup">Open an office</Button>
          </Reveal>
        </div>
        <Reveal className="m-showcase__device" y={40} delay={100}>
          <div className="m-showcase__glow" aria-hidden="true" />
          <DeviceFrame tilt={-4} width={310} follow>
            <PhoneThread />
          </DeviceFrame>
        </Reveal>
      </div>
    </section>
  );
}
