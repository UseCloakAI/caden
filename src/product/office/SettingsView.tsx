import { useEffect, useState, type FormEvent } from 'react';
import { Button, MonoLabel, Panel, TextField } from '@/ds';
import { supabase, callFunction } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { ErrorLine, PageHeader, TonePicker } from '../ui';

interface KeyStats {
  healthy: number;
  cooling_down: number;
}

export function SettingsView() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const { office, role, reload } = useOffice();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [officeName, setOfficeName] = useState(office?.name ?? '');
  const [officeNote, setOfficeNote] = useState(office?.note ?? '');
  const [officeTone, setOfficeTone] = useState(office?.tone ?? 'var(--color-horizon)');
  const [usage, setUsage] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [keyStats, setKeyStats] = useState<KeyStats | null>(null);
  const [donateKey, setDonateKey] = useState('');
  const [donateBusy, setDonateBusy] = useState(false);
  const [donateStatus, setDonateStatus] = useState<string | null>(null);

  const loadKeyStats = () => {
    supabase.rpc('provider_key_stats').maybeSingle().then(({ data }) => setKeyStats(data as KeyStats | null));
  };

  useEffect(() => {
    loadKeyStats();
  }, []);

  const donate = async (e: FormEvent) => {
    e.preventDefault();
    setDonateBusy(true);
    setDonateStatus(null);
    const res = await callFunction('donate-key', { api_key: donateKey.trim() });
    setDonateBusy(false);
    if (res.error) setDonateStatus(errorCopy(res.error));
    else {
      setDonateKey('');
      setDonateStatus('Added. Thanks — it now helps power replies for the whole platform.');
      loadKeyStats();
    }
  };

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
          <MonoLabel size="tiny" tone="var(--text-muted)">{`${profile?.email ?? ''} · ${session?.user.email_confirmed_at ? 'Verified' : 'Not verified'}`}</MonoLabel>
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

      <Panel level="card" padding="var(--spacing-24)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        <MonoLabel size="micro" tone="var(--text-body)">Community keys</MonoLabel>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body-sm)', color: 'var(--text-body)' }}>
          Agents reply using a shared, free-tier Groq key pool before falling back to Claude. Donate your own free
          Groq key (from console.groq.com) and it joins the pool for everyone — used to power other people's agents
          too, never shown again once saved.
        </p>
        <MonoLabel size="tiny" tone="var(--text-muted)">
          {keyStats ? `${keyStats.healthy} keys ready · ${keyStats.cooling_down} resting` : 'Checking pool…'}
        </MonoLabel>
        <form onSubmit={donate} style={{ display: 'flex', gap: 'var(--spacing-12)', flexWrap: 'wrap' }}>
          <TextField label="Groq API key" type="password" value={donateKey} onChange={setDonateKey} placeholder="gsk_…" required style={{ flex: 1, minWidth: 220 }} />
          <Button variant="ghost" type="submit" disabled={donateBusy || !donateKey.trim()} style={{ alignSelf: 'flex-end' }}>Donate key</Button>
        </form>
        <ErrorLine>{donateStatus}</ErrorLine>
      </Panel>

      <div style={{ display: 'flex', gap: 'var(--spacing-12)' }}>
        <Button variant="ghost" onClick={leave}>Leave office</Button>
        <Button variant="text" onClick={() => signOut()}>Sign out</Button>
      </div>
    </div>
  );
}
