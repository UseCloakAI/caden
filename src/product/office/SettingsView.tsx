import { useEffect, useState, type FormEvent } from 'react';
import { AnimatedNumber, Button, Dialog, MonoLabel, TextField, useToast } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { ErrorLine, PageHeader, Section, TonePicker } from '../ui';
import { KeyPool } from './KeyPool';

const DAILY_TOKENS = 200_000;

interface Usage {
  groq: number;
  anthropic: number;
}

/** One provider's slice of the shared daily budget — both bars scale to the same total, so their fills stay comparable. */
function UsageBar({ label, used }: { label: string; used: number | null }) {
  const share = used == null ? 0 : Math.min(1, used / DAILY_TOKENS);
  return (
    <div className="p-usage">
      <div className="p-usage__label">
        <MonoLabel size="tiny" tone="var(--text-body)">{label}</MonoLabel>
        <span className="p-usage__value">
          {used == null ? '—' : <AnimatedNumber value={used} />}
          <MonoLabel size="tiny" tone="var(--text-muted)">{` / ${DAILY_TOKENS.toLocaleString()}`}</MonoLabel>
        </span>
      </div>
      <span className="p-meter-bar" role="meter" aria-valuemin={0} aria-valuemax={DAILY_TOKENS} aria-valuenow={used ?? 0} aria-label={`${label} tokens used today`}>
        <span style={{ transform: `scaleX(${share})` }} />
      </span>
    </div>
  );
}

export function SettingsView() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const { office, role, reload } = useOffice();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [officeName, setOfficeName] = useState(office?.name ?? '');
  const [officeNote, setOfficeNote] = useState(office?.note ?? '');
  const [officeTone, setOfficeTone] = useState(office?.tone ?? 'var(--color-horizon)');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'profile' | 'office' | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const since = new Date(Date.now() - 86400_000).toISOString();
    supabase
      .from('agent_runs')
      .select('input_tokens, output_tokens, provider')
      .eq('owner_id', profile?.id ?? '')
      .gte('created_at', since)
      .then(({ data }) => {
        const sums: Usage = { groq: 0, anthropic: 0 };
        for (const r of (data ?? []) as { input_tokens: number; output_tokens: number; provider: string | null }[]) {
          const key = r.provider === 'groq' ? 'groq' : 'anthropic'; // runs from before the provider column existed were all Claude.
          sums[key] += r.input_tokens + r.output_tokens;
        }
        setUsage(sums);
      });
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

      <Section title="Usage · last 24 hours" description="Tokens your agents used, by provider. Groq runs first and is free; Claude only picks up a turn when every Groq key is resting, so it shares the same daily budget.">
        <div className="p-usage-group">
          <UsageBar label="Groq" used={usage?.groq ?? null} />
          <UsageBar label="Claude" used={usage?.anthropic ?? null} />
        </div>
      </Section>

      <KeyPool
        provider="groq"
        title="Community keys"
        description="Agents reply using a shared, free-tier Groq key pool before falling back to Claude. Donate your own free Groq key (from console.groq.com) and it joins the pool for everyone — used to power other people's agents too, never shown again once saved."
        fieldLabel="Groq API key"
        placeholder="gsk_…"
        thanks="Added. Thanks — it now helps power replies for the whole platform."
      />

      <KeyPool
        provider="tavily"
        title="Search keys"
        description="Agents can look things up with a shared, free-tier Tavily pool — current prices, hours, news, anything outside what they already know. Donate your own free Tavily key (from tavily.com, no card needed) and it joins the pool for everyone. If the pool ever runs dry, agents just answer from what they know."
        fieldLabel="Tavily API key"
        placeholder="tvly-…"
        thanks="Added. Thanks — agents can now search a little further before it runs dry."
      />

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
