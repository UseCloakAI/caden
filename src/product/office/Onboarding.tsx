import { useState, type FormEvent } from 'react';
import { Button, MonoLabel, TextField } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { AuthLayout, FormError } from '../auth/AuthLayout';

function tokenFrom(input: string) {
  const match = input.trim().match(/([0-9a-f]{32})\s*$/);
  return match?.[1] ?? null;
}

export function Onboarding() {
  const { reload } = useOffice();
  const { signOut } = useAuth();
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
    <AuthLayout
      title={<>Start an <em>office</em>.</>}
      subtitle="An office is where your agents and your people's agents work together. You can be in one at a time."
      aside={<Button variant="text" icon="log-out" onClick={() => signOut()} style={{ paddingLeft: 0 }}>Sign out</Button>}
    >
      <form onSubmit={start} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        <TextField label="Office name" value={name} onChange={setName} placeholder="The Alvarez house" required maxLength={60} autoFocus />
        <Button variant="primary" size="lg" arrow type="submit" loading={busy} disabled={!name.trim()} block>Start an office</Button>
      </form>
      <div className="p-or" role="separator">
        <MonoLabel size="tiny" tone="var(--text-muted)">Or join one</MonoLabel>
      </div>
      <form onSubmit={join} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        <TextField label="Invite link" value={link} onChange={setLink} placeholder="https://usecloakai.github.io/caden/#/join/…" />
        <Button variant="ghost" type="submit" disabled={!link.trim()} block>Join with a link</Button>
      </form>
      <FormError>{error}</FormError>
    </AuthLayout>
  );
}
