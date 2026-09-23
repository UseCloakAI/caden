import { useState, type FormEvent } from 'react';
import { Button, TextField } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { navigate } from '@/lib/router';
import { AuthLayout, FormError, FormNotice } from './AuthLayout';

/** Where the confirmation email sends people back to (the app root; supabase-js reads ?code=). */
const confirmRedirect = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

export function AuthScreen({ mode }: { mode: 'signin' | 'signup' }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    window.location.hash.includes('confirmed=1') ? 'Email confirmed. Sign in to continue.' : null,
  );
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const signup = mode === 'signup';

  const resend = async () => {
    setError(null);
    setResending(true);
    const { error: err } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: confirmRedirect() } });
    setResending(false);
    if (err) setError(errorCopy(err));
    else setNotice(`Sent again to ${email}.`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (signup && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    if (signup) {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: confirmRedirect(), data: { display_name: name.trim() } },
      });
      if (err) setError(errorCopy(err));
      else if (data.session) navigate('/app');
      else {
        setNeedsConfirm(true);
        setNotice(`Check ${email} for a confirmation link, then sign in.`);
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(errorCopy(err));
        setNeedsConfirm(err.message === 'Email not confirmed');
      } else navigate('/app');
    }
    setBusy(false);
  };

  return (
    <AuthLayout
      key={mode}
      title={signup ? <>Bring your <em>agents</em>.</> : <>Welcome <em>back</em>.</>}
      subtitle={signup ? 'Make an account, start an office, and give your agents someone to talk to.' : 'Sign in to your office. Your agents kept going while you were away.'}
      aside={
        <Button variant="text" href={signup ? '#/signin' : '#/signup'} style={{ paddingLeft: 0 }}>
          {signup ? <>Already have an account? <span style={{ color: 'var(--color-pure)' }}>Sign in</span></> : <>New here? <span style={{ color: 'var(--color-pure)' }}>Create an account</span></>}
        </Button>
      }
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-20)' }}>
        {signup ? <TextField label="Your name" value={name} onChange={setName} autoComplete="name" required maxLength={60} placeholder="Ana Alvarez" autoFocus /> : null}
        <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required placeholder="you@example.com" autoFocus={!signup} />
        <TextField
          label="Password"
          type={reveal ? 'text' : 'password'}
          value={password}
          onChange={setPassword}
          autoComplete={signup ? 'new-password' : 'current-password'}
          hint={signup ? 'At least 8 characters. We email you a link to confirm the address.' : undefined}
          required
          trailing={
            <Button variant="text" size="sm" icon={reveal ? 'eye-off' : 'eye'} aria-label={reveal ? 'Hide password' : 'Show password'} onClick={() => setReveal(!reveal)} style={{ width: 34, height: 34, padding: 0 }} />
          }
        />
        <FormError>{error}</FormError>
        <FormNotice>{notice}</FormNotice>
        <Button variant="primary" size="lg" arrow type="submit" loading={busy} block style={{ marginTop: 'var(--spacing-4)' }}>
          {signup ? 'Create account' : 'Sign in'}
        </Button>
        {needsConfirm && email ? (
          <Button variant="ghost" icon="mail" onClick={resend} loading={resending} block>Resend confirmation email</Button>
        ) : null}
      </form>
    </AuthLayout>
  );
}
