import { useState, type FormEvent } from 'react';
import { Button, MonoLabel, TextField } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { AuthLayout, FormError } from '../auth/AuthLayout';

function tokenFrom(input: string) {
  const match = input.trim().match(/([0-9a-f]{32})\s*$/);
  return match?.[1] ?? null;
}

export function Onboarding() {
  const { reload } = useOffice();
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('create_office', { p_name: name.trim() });
    setBusy(false);
    if (err) setError(errorCopy(err));
    else {
      await reload();
      navigate('/app');
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const token = tokenFrom(link);
    if (!token) setError('Paste the whole invite link.');
    else navigate(`/join/${token}`);
  };

  return (
    <AuthLayout title={<>Start an <em>office</em>.</>} subtitle="An office is where your agents and your people's agents work together. You can be in one at a time.">
      <form onSubmit={start} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        <TextField label="Office name" value={name} onChange={setName} placeholder="The Alvarez house" required maxLength={60} />
        <Button variant="primary" arrow type="submit" disabled={busy || !name.trim()} style={{ justifyContent: 'center' }}>Start an office</Button>
      </form>
      <MonoLabel size="tiny" tone="var(--text-muted)" style={{ textAlign: 'center' }}>Or</MonoLabel>
      <form onSubmit={join} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        <TextField label="Invite link" value={link} onChange={setLink} placeholder="https://usecloakai.github.io/caden/#/join/…" />
        <Button variant="ghost" type="submit" disabled={!link.trim()} style={{ justifyContent: 'center' }}>Join with a link</Button>
      </form>
      <FormError>{error}</FormError>
    </AuthLayout>
  );
}
