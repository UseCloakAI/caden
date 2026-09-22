import { useEffect, useState, type FormEvent } from 'react';
import { Button, MonoLabel, Panel, TextField } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { ErrorLine, PageHeader, TonePicker } from '../ui';

export function SettingsView() {
  const { profile, refreshProfile, signOut } = useAuth();
  const { office, role, reload } = useOffice();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [officeName, setOfficeName] = useState(office?.name ?? '');
  const [officeNote, setOfficeNote] = useState(office?.note ?? '');
  const [officeTone, setOfficeTone] = useState(office?.tone ?? 'var(--color-horizon)');
  const [usage, setUsage] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const since = new Date(Date.now() - 86400_000).toISOString();
    supabase
      .from('agent_runs')
      .select('input_tokens, output_tokens, owner_id')
      .eq('owner_id', profile?.id ?? '')
      .gte('created_at', since)
      .then(({ data }) => setUsage((data ?? []).reduce((n, r) => n + r.input_tokens + r.output_tokens, 0)));
  }, [profile?.id]);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', profile!.id);
    setStatus(error ? errorCopy(error) : 'Saved.');
    await refreshProfile();
    await reload();
  };

  const saveOffice = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('offices').update({ name: officeName.trim(), note: officeNote.trim() || null, tone: officeTone }).eq('id', office!.id);
    setStatus(error ? errorCopy(error) : 'Office saved.');
    await reload();
  };

  const leave = async () => {
    if (!window.confirm(`Leave ${office?.name}? Your agents leave with you.`)) return;
    const { error } = await supabase.rpc('leave_office');
    if (error) setStatus(errorCopy(error));
    else {
      await reload();
      navigate('/app');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-32)', maxWidth: 720 }}>
      <PageHeader eyebrow="Settings" title={<>Your <em>account</em>.</>} />
      <ErrorLine>{status}</ErrorLine>

      <Panel level="card" padding="var(--spacing-24)">
        <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
          <MonoLabel size="micro" tone="var(--text-body)">You</MonoLabel>
          <TextField label="Display name" value={name} onChange={setName} maxLength={60} />
          <MonoLabel size="tiny" tone="var(--text-muted)">{`${profile?.email ?? ''} · ${profile?.email_verified_at ? 'Verified' : 'Not verified'}`}</MonoLabel>
          <Button variant="primary" type="submit" style={{ alignSelf: 'flex-start' }}>Save</Button>
        </form>
      </Panel>

      {role === 'owner' ? (
        <Panel level="card" padding="var(--spacing-24)">
          <form onSubmit={saveOffice} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
            <MonoLabel size="micro" tone="var(--text-body)">Office</MonoLabel>
            <TextField label="Name" value={officeName} onChange={setOfficeName} maxLength={60} required />
            <TextField label="Note" value={officeNote} onChange={setOfficeNote} maxLength={140} placeholder="Four people, three agents, one calendar." />
            <TonePicker value={officeTone} onChange={setOfficeTone} />
            <Button variant="primary" type="submit" style={{ alignSelf: 'flex-start' }}>Save office</Button>
          </form>
        </Panel>
      ) : null}

      <Panel level="card" padding="var(--spacing-24)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
        <MonoLabel size="micro" tone="var(--text-body)">Usage · last 24 hours</MonoLabel>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-mono-label)', color: 'var(--color-cloud)' }}>
          {usage == null ? '—' : `${usage.toLocaleString()} / 200,000 TOKENS`}
        </span>
      </Panel>

      <div style={{ display: 'flex', gap: 'var(--spacing-12)' }}>
        <Button variant="ghost" onClick={leave}>Leave office</Button>
        <Button variant="text" onClick={() => signOut()}>Sign out</Button>
      </div>
    </div>
  );
}
