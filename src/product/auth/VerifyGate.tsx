import { useState } from 'react';
import { Button, MonoLabel } from '@/ds';
import { callFunction } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { AuthLayout, FormError } from './AuthLayout';

function useResend() {
  const [status, setStatus] = useState<string | null>(null);
  const resend = async () => {
    setStatus('Sending…');
    const res = await callFunction('send-verification');
    setStatus(res.error ? errorCopy(res.error) : res.status === 'verified' ? 'Already verified. Reload the page.' : 'Sent. Check your inbox.');
  };
  return { status, resend };
}

/** Thin strip above the app during the 1-hour grace window. */
export function VerifyBanner({ msLeft }: { msLeft: number }) {
  const { profile } = useAuth();
  const { status, resend } = useResend();
  const minutes = Math.max(1, Math.ceil(msLeft / 60000));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-16)', padding: 'var(--spacing-8) var(--spacing-20)', background: 'var(--color-midnight-blue)', borderBottom: 'var(--border-hairline)', flexWrap: 'wrap' }}>
      <MonoLabel size="tiny" tone="var(--color-cloud)">{`Verify ${profile?.email ?? 'your email'} · ${minutes} min left`}</MonoLabel>
      <Button variant="pill" onClick={resend} style={{ marginLeft: 'auto' }}>Resend email</Button>
      {status ? <MonoLabel size="tiny" tone="var(--text-body)">{status}</MonoLabel> : null}
    </div>
  );
}

/** After the grace window: read-only lockout until the email is verified. */
export function VerifyLockout() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { status, resend } = useResend();
  return (
    <AuthLayout title={<>Verify your <em>email</em>.</>} subtitle={`Your hour is up. Confirm ${profile?.email ?? 'your address'} to keep using Caden.`}>
      <Button variant="primary" arrow onClick={resend} style={{ justifyContent: 'center' }}>Send verification email</Button>
      <FormError>{status}</FormError>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="text" onClick={() => refreshProfile()}>I verified, check again</Button>
        <Button variant="text" onClick={() => signOut()}>Sign out</Button>
      </div>
    </AuthLayout>
  );
}

