import { useEffect, useState, type FormEvent } from 'react';
import { AnimatedNumber, Button, Dialog, MonoLabel, TextField, useToast } from '@/ds';
import { supabase, callFunction } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { ErrorLine, PageHeader, Section, TonePicker } from '../ui';

const DAILY_TOKENS = 200_000;

interface KeyStats {
  healthy: number;
  cooling_down: number;
}

export function SettingsView() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const { office, role, reload } = useOffice();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [officeName, setOfficeName] = useState(office?.name ?? '');
  const [officeNote, setOfficeNote] = useState(office?.note ?? '');
  const [officeTone, setOfficeTone] = useState(office?.tone ?? 'var(--color-horizon)');
  const [usage, setUsage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'profile' | 'office' | null>(null);
  const [leaving, setLeaving] = useState(false);
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
      toast('Key donated. Thanks for helping power the pool.');
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
    setSaving('profile');
    setError(null);
    const { error: err } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', profile!.id);
    setSaving(null);
    if (err) setError(errorCopy(err));
    else toast('Profile saved.');
    await refreshProfile();
    await reload();
  };

  const saveOffice = async (e: FormEvent) => {
    e.preventDefault();
    setSaving('office');
    setError(null);
    const { error: err } = await supabase.from('offices').update({ name: officeName.trim(), note: officeNote.trim() || null, tone: officeTone }).eq('id', office!.id);
    setSaving(null);
    if (err) setError(errorCopy(err));
    else toast('Office saved.');
    await reload();
  };

  const leave = async () => {
    const { error: err } = await supabase.rpc('leave_office');
    if (err) setError(errorCopy(err));
    else {
      await reload();
      navigate('/app');
    }
  };

  const profileDirty = name.trim() !== (profile?.display_name ?? '');
  const officeDirty = officeName.trim() !== (office?.name ?? '') || (officeNote.trim() || null) !== (office?.note ?? null) || officeTone !== office?.tone;
  const share = usage == null ? 0 : Math.min(1, usage / DAILY_TOKENS);

  return (
    <div className="p-stack p-narrow-page">
      <PageHeader eyebrow="Settings" title={<>Your <em>account</em>.</>} />
      <ErrorLine>{error}</ErrorLine>

      <Section title="You" description={`${profile?.email ?? ''} · ${session?.user.email_confirmed_at ? 'Verified' : 'Not verified'}`}>
        <form onSubmit={saveProfile} className="p-form">
          <TextField label="Display name" value={name} onChange={setName} maxLength={60} />
          <Button variant="primary" type="submit" loading={saving === 'profile'} disabled={!profileDirty || !name.trim()} style={{ alignSelf: 'flex-start' }}>Save</Button>
        </form>
      </Section>

      {role === 'owner' ? (
        <Section title="Office" description="Only the owner sees this. The colour fills the office tile everyone sees.">
          <form onSubmit={saveOffice} className="p-form">
            <div className="p-office-preview" style={{ background: officeTone }}>
              <MonoLabel size="tiny" tone="currentColor" style={{ opacity: 0.75 }}>Preview</MonoLabel>
              <span className="p-office-preview__name">{officeName || 'Office name'}</span>
            </div>
            <TextField label="Name" value={officeName} onChange={setOfficeName} maxLength={60} required />
            <TextField label="Note" value={officeNote} onChange={setOfficeNote} maxLength={140} placeholder="Four people, three agents, one calendar." />
            <TonePicker value={officeTone} onChange={setOfficeTone} />
            <Button variant="primary" type="submit" loading={saving === 'office'} disabled={!officeDirty || !officeName.trim()} style={{ alignSelf: 'flex-start' }}>Save office</Button>
          </form>
        </Section>
      ) : null}

      <Section title="Usage · last 24 hours" description="Tokens your agents used across every conversation and routine.">
        <div className="p-usage">
          <span className="p-usage__value">
            {usage == null ? '—' : <AnimatedNumber value={usage} />}
            <MonoLabel size="tiny" tone="var(--text-muted)">{` / ${DAILY_TOKENS.toLocaleString()} tokens`}</MonoLabel>
          </span>
          <span className="p-meter-bar" role="meter" aria-valuemin={0} aria-valuemax={DAILY_TOKENS} aria-valuenow={usage ?? 0} aria-label="Tokens used today">
            <span style={{ transform: `scaleX(${share})` }} />
          </span>
        </div>
      </Section>

      <Section
        title="Community keys"
        description="Agents reply using a shared, free-tier Groq key pool before falling back to Claude. Donate your own free Groq key (from console.groq.com) and it joins the pool for everyone — used to power other people's agents too, never shown again once saved."
      >
        <MonoLabel size="tiny" tone="var(--text-muted)">
          {keyStats ? `${keyStats.healthy} keys ready · ${keyStats.cooling_down} resting` : 'Checking pool…'}
        </MonoLabel>
        <form onSubmit={donate} className="p-form" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <TextField label="Groq API key" type="password" value={donateKey} onChange={setDonateKey} placeholder="gsk_…" required style={{ flex: 1, minWidth: 220 }} />
          <Button variant="ghost" type="submit" loading={donateBusy} disabled={!donateKey.trim()}>Donate key</Button>
        </form>
        <ErrorLine>{donateStatus}</ErrorLine>
      </Section>

      <Section title="Leave or sign out" description={`Leaving ${office?.name ?? 'the office'} takes your agents with you. You can join another office afterwards.`}>
        <div style={{ display: 'flex', gap: 'var(--spacing-12)', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => setLeaving(true)}>Leave office</Button>
          <Button variant="text" icon="log-out" onClick={() => signOut()}>Sign out</Button>
        </div>
      </Section>

      {leaving ? (
        <Dialog onClose={() => setLeaving(false)} title={`Leave ${office?.name}?`} confirmLabel="Leave office" onConfirm={leave}>
          Your agents leave with you, and you lose access to this office's conversations.
        </Dialog>
      ) : null}
    </div>
  );
}
