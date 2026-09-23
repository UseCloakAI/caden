import { useState, type FormEvent, type ReactNode } from 'react';
import { AgentAvatar, Badge, Button, Dialog, DisplayHeadline, Drawer, MonoLabel, Switch, TextArea, TextField, useToast } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { AGENT_TONES, useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import type { Agent } from '@/lib/types';
import { ErrorLine, TonePicker, handleFromName } from '../ui';
import { RoutinesPanel } from './RoutinesPanel';

export function AgentDrawer({ agentId, onClose }: { agentId: string | 'new'; onClose: () => void }) {
  const { session } = useAuth();
  const { agentById, memberById, agents, reload } = useOffice();
  const agent = agentId === 'new' ? undefined : agentById(agentId);
  const mine = agentId === 'new' || agent?.owner_id === session?.user.id;

  if (agentId !== 'new' && !agent) {
    return (
      <Drawer onClose={onClose} eyebrow="Agent">
        <MonoLabel size="tiny" tone="var(--text-muted)">This agent is not in your office.</MonoLabel>
      </Drawer>
    );
  }
  if (!mine && agent) return <AgentProfile agent={agent} owner={memberById(agent.owner_id)?.profile?.display_name} onClose={onClose} />;
  return <AgentForm agent={agent} nextTone={AGENT_TONES[agents.length % AGENT_TONES.length]} onClose={onClose} onSaved={reload} />;
}

async function openDirect(agentId: string) {
  const { data, error } = await supabase.rpc('open_conversation', { p_agent_ids: [agentId], p_include_me: true });
  if (error) throw error;
  navigate(`/app/office/${data}`);
}

function Identity({ name, tone, handle, meta, active, title }: { name: string; tone: string; handle?: string; meta?: string; active?: boolean; title?: ReactNode }) {
  return (
    <div className="p-identity">
      <div className="p-identity__ground" style={{ background: tone }} aria-hidden="true" />
      <AgentAvatar name={name || 'Agent'} tone={tone} size="xl" active={active} ring="var(--surface-canvas)" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)', minWidth: 0 }}>
        <DisplayHeadline size="card" align="left" as="h2">{title ?? name}</DisplayHeadline>
        {handle || meta ? <MonoLabel size="tiny" tone="var(--text-muted)">{[handle, meta].filter(Boolean).join(' · ')}</MonoLabel> : null}
      </div>
    </div>
  );
}

function AgentProfile({ agent, owner, onClose }: { agent: Agent; owner?: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Drawer onClose={onClose} eyebrow={`${owner ? `${owner}'s` : 'Office'} agent`} label={agent.name}>
      <Identity name={agent.name} tone={agent.tone} handle={`@${agent.handle}`} meta={agent.status} active={agent.status === 'Active'} />
      <p className="p-lede">{agent.persona || 'No description yet.'}</p>
      <ErrorLine>{error}</ErrorLine>
      <Button
        variant="primary"
        arrow
        icon="message-circle"
        loading={busy}
        onClick={() => {
          setBusy(true);
          openDirect(agent.id).catch((e) => {
            setBusy(false);
            setError(errorCopy(e));
          });
        }}
        style={{ alignSelf: 'flex-start' }}
      >
        {`Message ${agent.name}`}
      </Button>
    </Drawer>
  );
}

function AgentForm({ agent, nextTone, onClose, onSaved }: { agent?: Agent; nextTone: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { session } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(agent?.name ?? '');
  const [handle, setHandle] = useState(agent?.handle ?? '');
  const [handleTouched, setHandleTouched] = useState(false);
  const [tone, setTone] = useState(agent?.tone ?? nextTone);
  const [persona, setPersona] = useState(agent?.persona ?? '');
  const [paused, setPaused] = useState(agent?.status === 'Paused');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [opening, setOpening] = useState(false);
  const shownHandle = agent || handleTouched ? handle : handleFromName(name);
  const dirty = !agent || name !== agent.name || tone !== agent.tone || persona !== agent.persona || paused !== (agent.status === 'Paused');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fields = { name: name.trim(), tone, persona: persona.trim(), status: paused ? 'Paused' : 'Active' };
    const { data, error: err } = agent
      ? await supabase.from('agents').update(fields).eq('id', agent.id).select('id').single()
      : await supabase.from('agents').insert({ ...fields, handle: shownHandle.replace(/^@/, ''), owner_id: session!.user.id }).select('id').single();
    setBusy(false);
    if (err) {
      setError(errorCopy(err));
      return;
    }
    await onSaved();
    toast(agent ? `${fields.name} saved.` : `${fields.name} joined the office.`);
    if (!agent && data) navigate(`/app/agents/${data.id}`);
  };

  const remove = async () => {
    if (!agent) return;
    const { error: err } = await supabase.from('agents').delete().eq('id', agent.id);
    if (err) setError(errorCopy(err));
    else {
      await onSaved();
      toast(`${agent.name} deleted.`, { icon: 'trash' });
      onClose();
    }
  };

  return (
    <Drawer
      onClose={onClose}
      eyebrow={agent ? 'Your agent' : 'New agent'}
      label={agent ? agent.name : 'New agent'}
      actions={agent ? <Badge variant="quiet" dot={paused ? 'var(--color-fog)' : 'live'}>{paused ? 'Paused' : 'Active'}</Badge> : null}
    >
      <Identity
        name={name}
        tone={tone}
        handle={shownHandle ? `@${shownHandle.replace(/^@/, '')}` : undefined}
        active={!!agent && !paused}
        title={agent ? name || agent.name : name ? name : <>A new <em>agent</em>.</>}
      />
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-20)' }}>
        <TextField label="Name" value={name} onChange={setName} required maxLength={40} placeholder="Maya" autoFocus={!agent} />
        <TextField
          label="Handle"
          value={shownHandle}
          onChange={(v) => {
            setHandleTouched(true);
            setHandle(v.toLowerCase());
          }}
          disabled={!!agent}
          required
          pattern="@?[a-z0-9][a-z0-9._]{1,23}"
          hint={agent ? 'Handles are permanent.' : 'Other agents @mention this. Lowercase letters, numbers, dots.'}
        />
        <TonePicker value={tone} onChange={setTone} />
        <TextArea
          label="What it does"
          value={persona}
          onChange={setPersona}
          rows={5}
          maxLength={2000}
          placeholder="Runs the household calendar. Warm, brief, and never double-books Sunday."
          hint="This is the agent's brief. It shapes every reply."
        />
        <label className="p-toggle-row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            <span className="p-toggle-row__title">{paused ? 'Paused' : 'Active'}</span>
            <MonoLabel size="tiny" tone="var(--text-muted)">{paused ? 'Will not read or reply' : 'Replies when addressed'}</MonoLabel>
          </div>
          <Switch checked={!paused} onChange={(on) => setPaused(!on)} aria-label="Active" />
        </label>
        <ErrorLine>{error}</ErrorLine>
        <div className="p-form-actions">
          {agent ? <Button variant="text" icon="trash" onClick={() => setConfirmDelete(true)} style={{ paddingLeft: 0 }}>Delete</Button> : null}
          {agent ? (
            <Button
              variant="ghost"
              icon="message-circle"
              loading={opening}
              onClick={() => {
                setOpening(true);
                openDirect(agent.id).catch((e) => {
                  setOpening(false);
                  setError(errorCopy(e));
                });
              }}
            >
              Message
            </Button>
          ) : null}
          <Button variant="primary" arrow type="submit" loading={busy} disabled={!name.trim() || !dirty} style={{ marginLeft: 'auto' }}>
            {agent ? 'Save agent' : 'Create agent'}
          </Button>
        </div>
      </form>
      {agent ? <RoutinesPanel agent={agent} /> : null}
      {confirmDelete && agent ? (
        <Dialog onClose={() => setConfirmDelete(false)} title={`Delete ${agent.name}?`} confirmLabel="Delete agent" onConfirm={remove}>
          {`${agent.name} leaves the office and its routines stop. Its messages stay in the threads.`}
        </Dialog>
      ) : null}
    </Drawer>
  );
}
