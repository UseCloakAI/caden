import { useState } from 'react';
import { AgentAvatar, Button, DisplayHeadline, MonoLabel, Switch, TextField } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { Drawer, EmptyState, ErrorLine } from '../ui';

/** Pick agents: two makes a one-on-one, more makes a group. Include yourself or let them talk alone. */
export function NewConversation({ onClose }: { onClose: () => void }) {
  const { agents, memberById } = useOffice();
  const [picked, setPicked] = useState<string[]>([]);
  const [includeMe, setIncludeMe] = useState(true);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const count = picked.length + (includeMe ? 1 : 0);
  const kind = count === 2 ? 'One-on-one' : count > 2 ? 'Group' : null;

  const toggle = (id: string, on: boolean) => setPicked((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));

  const create = async () => {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('open_conversation', {
      p_agent_ids: picked,
      p_include_me: includeMe,
      p_title: count > 2 && title.trim() ? title.trim() : null,
    });
    setBusy(false);
    if (err) setError(errorCopy(err));
    else navigate(`/app/office/${data}`);
  };

  return (
    <Drawer onClose={onClose}>
      <DisplayHeadline size="card" align="left" as="h2">New <em>conversation</em>.</DisplayHeadline>
      <MonoLabel size="tiny" tone="var(--text-muted)">Two members makes a one-on-one. Three or more makes a group.</MonoLabel>
      {agents.length === 0 ? <EmptyState fact="No agents in this office yet." action={<Button variant="text" href="#/app/agents/new" arrow>Create an agent</Button>} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
        {agents.map((a) => (
          <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)', padding: 'var(--spacing-12) var(--spacing-16)', background: 'var(--surface-card)', borderRadius: 'var(--radius-cards)', cursor: 'pointer' }}>
            <AgentAvatar name={a.name} tone={a.tone} size="sm" />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--color-cloud)' }}>{a.name}</span>
              <MonoLabel size="tiny" tone="var(--text-muted)">{`@${a.handle} · ${memberById(a.owner_id)?.profile?.display_name ?? 'Office'}`}</MonoLabel>
            </div>
            <Switch checked={picked.includes(a.id)} onChange={(on) => toggle(a.id, on)} aria-label={`Include ${a.name}`} />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)' }}>
        <Switch checked={includeMe} onChange={setIncludeMe} aria-label="Include me" />
        <MonoLabel size="tiny">{includeMe ? 'You are in this conversation' : 'Agents only · you can still read it'}</MonoLabel>
      </div>
      {count > 2 ? <TextField label="Group name (optional)" value={title} onChange={setTitle} maxLength={60} placeholder="Sunday dinner" /> : null}
      <ErrorLine>{error}</ErrorLine>
      <Button variant="primary" arrow onClick={create} disabled={busy || !kind} style={{ alignSelf: 'flex-start' }}>
        {kind ? `Start ${kind.toLowerCase()}` : 'Pick members'}
      </Button>
    </Drawer>
  );
}
