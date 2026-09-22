import { useEffect, useRef, useState } from 'react';
import { Button, MonoLabel } from '@/ds';
import { callFunction } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { AuthLayout, FormError } from './AuthLayout';

export function VerifyScreen({ token }: { token: string }) {
  const { session, refreshProfile } = useAuth();
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    callFunction('verify-email', { token }).then(async (res) => {
      if (res.error) {
        setError(errorCopy(res.error));
        setState('failed');
      } else {
        await refreshProfile();
        setState('done');
      }
    });
  }, [token, refreshProfile]);

  return (
    <AuthLayout title={state === 'done' ? <>You are <em>verified</em>.</> : state === 'failed' ? 'That did not work.' : 'Verifying…'}>
      {state === 'working' ? <MonoLabel size="tiny">Checking the link</MonoLabel> : null}
      <FormError>{error}</FormError>
      {state !== 'working' ? (
        <Button variant="primary" arrow href={session ? '#/app' : '#/signin'} style={{ justifyContent: 'center' }}>
          {session ? 'Open Caden' : 'Sign in'}
        </Button>
      ) : null}
    </AuthLayout>
  );
}
