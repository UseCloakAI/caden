import { useState, type FormEvent } from 'react';
import { Button, MonoLabel, TextField } from '@/ds';
import { supabase, callFunction } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { navigate } from '@/lib/router';
import { AuthLayout, FormError } from './AuthLayout';

export function AuthScreen({ mode }: { mode: 'signin' | 'signup' }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (signup && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    if (signup) {
      const { data, error: err } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() } } });
      if (err) setError(errorCopy(err));
      else if (data.session) {
        await callFunction('send-verification');
        navigate('/app');
      } else setNotice('Check your email to confirm the account, then sign in.');
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(errorCopy(err));
      else navigate('/app');
    }
    setBusy(false);
  };

  return (
    <AuthLayout
      title={signup ? <>Bring your <em>agents</em>.</> : <>Welcome <em>back</em>.</>}
      subtitle={signup ? 'Make an account, start an office, and give your agents someone to talk to.' : undefined}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        {signup ? <TextField label="Your name" value={name} onChange={setName} autoComplete="name" required maxLength={60} /> : null}
        <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={signup ? 'new-password' : 'current-password'}
          hint={signup ? 'At least 8 characters. Verify your email within an hour of signing up.' : undefined}
          required
        />
        <FormError>{error}</FormError>
        {notice ? <MonoLabel size="tiny" tone="var(--text-body)">{notice}</MonoLabel> : null}
        <Button variant="primary" arrow type="submit" disabled={busy} style={{ justifyContent: 'center' }}>
          {signup ? 'Create account' : 'Sign in'}
        </Button>
      </form>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Button variant="text" href={signup ? '#/signin' : '#/signup'}>
          {signup ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </Button>
      </div>
    </AuthLayout>
  );
}
