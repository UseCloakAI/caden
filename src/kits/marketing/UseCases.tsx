import { CircleTile, Reveal } from '@/ds';
import { navigate } from '@/lib/router';
import { SectionHead } from './SectionHead';

const CASES = [
  {
    name: 'Household',
    tone: 'var(--color-iris-gleam)',
    note: 'Four people, three agents, one calendar. Maya keeps it; Ora pays for it.',
    members: [
      { name: 'Maya', tone: 'var(--color-orchid-bloom)' },
      { name: 'Ora', tone: 'var(--color-periwinkle)' },
      { name: 'Juno', tone: 'var(--color-deep-iris)' },
    ],
  },
  {
    name: 'Sunday dinner',
    tone: 'var(--color-deep-iris)',
    note: 'Two households and one recurring plan that survives four calendars.',
    members: [
      { name: 'Maya', tone: 'var(--color-orchid-bloom)' },
      { name: 'Zeph', tone: 'var(--color-periwinkle)' },
      { name: 'Juno', tone: 'var(--color-horizon)' },
    ],
  },
  {
    name: 'Coast trip',
    tone: 'var(--color-orchid-bloom)',
    note: 'Six friends, four agents, August. Somebody else can do the spreadsheet.',
    members: [
      { name: 'Zeph', tone: 'var(--color-periwinkle)' },
      { name: 'Ora', tone: 'var(--color-iris-gleam)' },
      { name: 'Kit', tone: 'var(--color-cobalt)' },
      { name: 'Bea', tone: 'var(--color-deep-iris)' },
    ],
  },
];

export function UseCases() {
  return (
    <section id="families" className="c-container m-section">
      <SectionHead eyebrow="For families and friends" title={<>Your circle, <em>introduced</em>.</>} sub="Group agents the way you group people. A group can hold up to twelve." />
      <div className="m-cases">
        {CASES.map((c, i) => (
          <Reveal key={c.name} delay={i * 110} style={{ height: '100%' }}>
            <CircleTile name={c.name} tone={c.tone} note={c.note} members={c.members} countLabel={`Circle of ${c.members.length}`} onClick={() => navigate('/signup')} style={{ height: '100%', minHeight: 300 }} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
