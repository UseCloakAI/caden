import { useState, type FormEvent } from 'react';
import { AgentAvatar, Button, DisplayHeadline, MonoLabel, Switch, TextArea, TextField } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { AGENT_TONES, useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import type { Agent } from '@/lib/types';
import { Drawer, ErrorLine, TonePicker, handleFromName } from '../ui';
import { RoutinesPanel } from './RoutinesPanel';

export function AgentDrawer({ agentId, onClose }: { agentId: string | 'new'; onClose: () => void }) {
  const { session } = useAuth();
  const { agentById, memberById, agents, reload } = useOffice();
  const agent = agentId === 'new' ? undefined : agentById(agentId);
  const mine = agentId === 'new' || agent?.owner_id === session?.user.id;

  if (agentId !== 'new' && !agent) {
    return (
      <Drawer onClose={onClose}>
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

function AgentProfile({ agent, owner, onClose }: { agent: Agent; owner?: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Drawer onClose={onClose}>
      <AgentAvatar name={agent.name} tone={agent.tone} size="xl" active={agent.status === 'Active'} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
        <DisplayHeadline size="card" align="left" as="h2">{agent.name}</DisplayHeadline>
        <MonoLabel size="tiny" tone="var(--text-muted)">{`@${agent.handle} · ${owner ? `${owner}'s` : 'Office'} · ${agent.status}`}</MonoLabel>
      </div>
      <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 300, fontSize: 'var(--text-subheading)', lineHeight: 'var(--leading-subheading)', color: 'var(--text-body)' }}>
        {agent.persona || 'No description yet.'}
      </p>
      <ErrorLine>{error}</ErrorLine>
      <Button variant="primary" arrow icon="message-circle" onClick={() => openDirect(agent.id).catch((e) => setError(errorCopy(e)))} style={{ alignSelf: 'flex-start' }}>
        {`Message ${agent.name}`}
      </Button>
    </Drawer>
  );
}

function AgentForm({ agent, nextTone, onClose, onSaved }: { agent?: Agent; nextTone: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { session } = useAuth();
  const [name, setName] = useState(agent?.name ?? '');
  const [handle, setHandle] = useState(agent?.handle ?? '');
  const [handleTouched, setHandleTouched] = useState(false);
  const [tone, setTone] = useState(agent?.tone ?? nextTone);
  const [persona, setPersona] = useState(agent?.persona ?? '');
  const [paused, setPaused] = useState(agent?.status === 'Paused');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shownHandle = agent || handleTouched ? handle : handleFromName(name);

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
    if (!agent && data) navigate(`/app/agents/${data.id}`);
  };

  const remove = async () => {
    if (!agent || !window.confirm(`Delete ${agent.name}? Its messages stay in the threads.`)) return;
    const { error: err } = await supabase.from('agents').delete().eq('id', agent.id);
    if (err) setError(errorCopy(err));
    else {
      await onSaved();
      onClose();
    }
  };

  return (
    <Drawer onClose={onClose}>
      <AgentAvatar name={name || 'Agent'} tone={tone} size="xl" active={!!agent && !paused} />
      <DisplayHeadline size="card" align="left" as="h2">{agent ? agent.name : <>A new <em>agent</em>.</>}</DisplayHeadline>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-20)' }}>
        <TextField label="Name" value={name} onChange={setName} required maxLength={40} placeholder="Maya" />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)' }}>
          <Switch checked={!paused} onChange={(on) => setPaused(!on)} aria-label="Active" />
          <MonoLabel size="tiny">{paused ? 'Paused · will not reply' : 'Active · replies when addressed'}</MonoLabel>
        </div>
        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)' }}>
          {agent ? <Button variant="text" type="button" onClick={remove}>Delete agent</Button> : null}
          {agent ? <Button variant="ghost" type="button" icon="message-circle" onClick={() => openDirect(agent.id).catch((e) => setError(errorCopy(e)))}>Message</Button> : null}
          <Button variant="primary" arrow type="submit" disabled={busy || !name.trim()} style={{ marginLeft: 'auto' }}>
            {agent ? 'Save agent' : 'Create agent'}
          </Button>
        </div>
      </form>
      {agent ? <RoutinesPanel agent={agent} /> : null}
    </Drawer>
  );
}
