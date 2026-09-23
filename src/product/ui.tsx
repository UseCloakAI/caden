import type { ReactNode } from 'react';
import { DisplayHeadline, Icon, MonoLabel, Subhead, type IconName } from '@/ds';
import type { ConversationWithPeople, Member } from '@/lib/office';
import type { Agent } from '@/lib/types';
import { AGENT_TONES } from '@/lib/office';

export { Drawer } from '@/ds';

/** People have no identity colour; they sit on Steel. */
export const HUMAN_TONE = 'var(--color-steel)';

export function PageHeader({ eyebrow, title, sub, action }: { eyebrow: string; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="p-page-head">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)', minWidth: 0 }}>
        <MonoLabel size="micro" tone="var(--text-muted)">{eyebrow}</MonoLabel>
        <DisplayHeadline size="card" align="left" as="h1" animate={40}>{title}</DisplayHeadline>
        {sub ? <Subhead align="left" maxWidth={560} style={{ fontSize: 'var(--text-body-md)' }}>{sub}</Subhead> : null}
      </div>
      {action ? <div className="p-page-head__action">{action}</div> : null}
    </header>
  );
}

/** The fact, then the single next action. */
export function EmptyState({ fact, detail, action, icon = 'users' }: { fact: string; detail?: string; action?: ReactNode; icon?: IconName }) {
  return (
    <div className="p-empty">
      <span className="p-empty__icon"><Icon name={icon} size={20} tone="ash" /></span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
        <span className="p-empty__fact">{fact}</span>
        {detail ? <span className="p-empty__detail">{detail}</span> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorLine({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="p-alert" role="alert">{children}</p>;
}

/** Section card: mono title, optional description, content. */
export function Section({ title, description, action, children, id }: { title: string; description?: ReactNode; action?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <section className="p-section" id={id}>
      <div className="p-section__head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)', minWidth: 0 }}>
          <MonoLabel size="micro" tone="var(--color-cloud)">{title}</MonoLabel>
          {description ? <p className="p-section__desc">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The six agent identity grounds as round swatches. */
export function TonePicker({ value, onChange, label = 'Colour' }: { value: string; onChange: (tone: string) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
      <MonoLabel size="tiny">{label}</MonoLabel>
      <div style={{ display: 'flex', gap: 'var(--spacing-8)', flexWrap: 'wrap' }}>
        {AGENT_TONES.map((tone) => {
          const on = value === tone;
          const name = tone.replace('var(--color-', '').replace(')', '').replace('-', ' ');
          return (
            <button key={tone} type="button" role="radio" aria-label={name} aria-checked={on} title={name} onClick={() => onChange(tone)} className="p-swatch" style={{ background: tone }}>
              <Icon name="check" size={14} tone={['var(--color-periwinkle)', 'var(--color-orchid-bloom)'].includes(tone) ? 'dark' : 'pure'} strokeWidth={2.5} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function handleFromName(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 17);
  return base ? `${base}.agent` : '';
}

/** Initials-friendly name for a person. */
export const personName = (m: Member | undefined, me?: string) => (m?.user_id === me ? 'You' : m?.profile?.display_name || 'Someone');

/** Who a thread is between, from your point of view. */
export function conversationLabel(
  convo: ConversationWithPeople,
  me: string | undefined,
  agentById: (id: string | null) => Agent | undefined,
  memberById: (id: string | null) => Member | undefined,
  officeName = 'Office',
) {
  if (convo.kind === 'office') return officeName;
  if (convo.title) return convo.title;
  const names = convo.participants
    .filter((p) => p.user_id !== me)
    .map((p) => (p.agent_id ? agentById(p.agent_id)?.name : memberById(p.user_id)?.profile?.display_name) ?? 'Someone');
  return names.join(' · ') || 'Just you';
}

/** Everyone in a thread (minus you) as avatar data, agents first. */
export function conversationFaces(
  convo: ConversationWithPeople,
  me: string | undefined,
  agentById: (id: string | null) => Agent | undefined,
  memberById: (id: string | null) => Member | undefined,
) {
  const others = convo.participants.filter((p) => p.user_id !== me);
  const agents = others.flatMap((p) => (p.agent_id ? [agentById(p.agent_id)] : [])).filter((a): a is Agent => !!a).map((a) => ({ name: a.name, tone: a.tone }));
  const people = others.flatMap((p) => (p.user_id ? [{ name: memberById(p.user_id)?.profile?.display_name || 'Someone', tone: HUMAN_TONE }] : []));
  return [...agents, ...people];
}
