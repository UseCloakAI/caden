import { useState } from 'react';
import { AgentAvatar, Button, Collapse, DisplayHeadline, Drawer, Icon, MonoLabel, Switch, TextField, type StyleVars } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { EmptyState, ErrorLine } from '../ui';

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

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
    <Drawer onClose={onClose} eyebrow="New conversation" label="New conversation">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
        <DisplayHeadline size="card" align="left" as="h2">Who is <em>talking</em>?</DisplayHeadline>
        <p className="p-section__desc">Two members makes a one-on-one. Three or more makes a group.</p>
      </div>
      {agents.length === 0 ? (
        <EmptyState fact="No agents in this office yet." action={<Button variant="text" href="#/app/agents/new" arrow style={{ paddingLeft: 0 }}>Create an agent</Button>} />
      ) : (
        <div className="p-picker" role="group" aria-label="Agents">
          {agents.map((a, i) => {
            const on = picked.includes(a.id);
            return (
              <button key={a.id} type="button" className="p-pick" aria-pressed={on} onClick={() => toggle(a.id)} style={{ '--tone': a.tone, '--i': i } as StyleVars}>
                <AgentAvatar name={a.name} tone={a.tone} size="sm" />
                <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span className="p-pick__name">{a.name}</span>
                  <MonoLabel size="tiny" tone="var(--text-muted)">{`@${a.handle} · ${memberById(a.owner_id)?.profile?.display_name ?? 'Office'}`}</MonoLabel>
                </span>
                <span className="p-pick__check"><Icon name="check" size={14} tone="dark" strokeWidth={2.5} /></span>
              </button>
            );
          })}
        </div>
      )}
      <label className="p-toggle-row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span className="p-toggle-row__title">{includeMe ? 'Include me' : 'Agents only'}</span>
          <MonoLabel size="tiny" tone="var(--text-muted)">{includeMe ? 'You are in this conversation' : 'You can still read it'}</MonoLabel>
        </div>
        <Switch checked={includeMe} onChange={setIncludeMe} aria-label="Include me" />
      </label>
      <Collapse open={count > 2}>
        <TextField label="Group name (optional)" value={title} onChange={setTitle} maxLength={60} placeholder="Sunday dinner" />
      </Collapse>
      <ErrorLine>{error}</ErrorLine>
      <div className="p-form-actions">
        <MonoLabel key={kind ?? 'none'} size="tiny" tone={kind ? 'var(--color-cloud)' : 'var(--text-muted)'} className="c-enter">
          {kind ? `${kind} · ${count} members` : 'Pick at least one agent'}
        </MonoLabel>
        <Button variant="primary" arrow onClick={create} loading={busy} disabled={!kind} style={{ marginLeft: 'auto' }}>
          {kind ? `Start ${kind.toLowerCase()}` : 'Start'}
        </Button>
      </div>
    </Drawer>
  );
}
