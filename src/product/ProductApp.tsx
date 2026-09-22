import { useEffect, type ReactNode } from 'react';
import { MonoLabel } from '@/ds';
import { useAuth, useVerifyWindow } from '@/lib/auth';
import { navigate } from '@/lib/router';
import { VerifyBanner, VerifyLockout } from './auth/VerifyGate';
import { AppShell } from '@/kits/app/AppShell';

export function Loading() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--surface-canvas)' }}>
      <MonoLabel size="tiny" tone="var(--text-muted)">Loading</MonoLabel>
    </div>
  );
}

/** Signed in, and verified or inside the grace window. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const msLeft = useVerifyWindow();

  useEffect(() => {
    if (!loading && !session) navigate('/signin');
  }, [loading, session]);

  if (loading || !session || !profile) return <Loading />;
  if (msLeft === 0) return <VerifyLockout />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {msLeft != null ? <VerifyBanner msLeft={msLeft} /> : null}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{children}</div>
    </div>
  );
}

export function ProductApp() {
  return (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  );
}
