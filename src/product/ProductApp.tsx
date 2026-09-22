import { useEffect, type ReactNode } from 'react';
import { MonoLabel } from '@/ds';
import { useAuth, useVerifyWindow } from '@/lib/auth';
import { navigate } from '@/lib/router';
import { VerifyBanner, VerifyLockout } from './auth/VerifyGate';
import { OfficeProvider, useOffice } from '@/lib/office';
import { useRoute } from '@/lib/router';
import { Onboarding } from './office/Onboarding';
import { JoinScreen } from './office/JoinScreen';
import { Shell } from './Shell';

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

function OfficeGate() {
  const [head, view, id] = useRoute();
  const { status } = useOffice();
  if (status === 'loading') return <Loading />;
  if (head === 'join' && view) return <JoinScreen token={view} />;
  if (status === 'none') return <Onboarding />;
  return <Shell view={view ?? 'agents'} id={id} />;
}

export function ProductApp() {
  return (
    <RequireAuth>
      <OfficeProvider>
        <OfficeGate />
      </OfficeProvider>
    </RequireAuth>
  );
}
