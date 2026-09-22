import type { ReactNode } from 'react';
import { Button, DisplayHeadline, MonoLabel } from '@/ds';
import type { ConversationWithPeople, Member } from '@/lib/office';
import type { Agent } from '@/lib/types';
import { AGENT_TONES } from '@/lib/office';

/** Right-hand drawer over a blurred scrim, matching the app kit's agent drawer. */
export function Drawer({ onClose, children, width = 460 }: { onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(9,10,11,0.6)', backdropFilter: 'var(--blur-glass)' }} />
      <div
        role="dialog"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: width,
          background: 'var(--surface-canvas)',
          borderLeft: 'var(--border-hairline)',
          padding: 'var(--spacing-32)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-24)',
        }}
      >
        <Button variant="glass" icon="x" aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 'var(--spacing-24)', right: 'var(--spacing-24)' }} />
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: ReactNode; action?: ReactNode }) {
  return (
    <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--spacing-24)', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
        <MonoLabel size="micro" tone="var(--text-muted)">{eyebrow}</MonoLabel>
        <DisplayHeadline size="card" align="left" as="h1">{title}</DisplayHeadline>
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ fact, action }: { fact: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--spacing-12)', padding: 'var(--spacing-24) 0' }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-md)', color: 'var(--text-body)' }}>{fact}</span>
      {action}
    </div>
  );
}

export function ErrorLine({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <MonoLabel size="tiny" tone="var(--color-cloud)" role="alert">{children}</MonoLabel>;
}

/** The six agent identity grounds as round swatches. */
export function TonePicker({ value, onChange }: { value: string; onChange: (tone: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
      <MonoLabel size="tiny">Colour</MonoLabel>
      <div style={{ display: 'flex', gap: 'var(--spacing-8)' }}>
        {AGENT_TONES.map((tone) => (
          <button
            key={tone}
            type="button"
            aria-label={tone.replace('var(--color-', '').replace(')', '')}
            aria-pressed={value === tone}
            onClick={() => onChange(tone)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-pill)',
              background: tone,
              border: value === tone ? '2px solid var(--color-pure)' : '2px solid transparent',
              outline: value === tone ? '1px solid var(--color-void)' : 'none',
              outlineOffset: -3,
              cursor: 'pointer',
              transition: 'var(--transition-state)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function handleFromName(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 17);
  return base ? `${base}.agent` : '';
}

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
