import { useEffect, type ReactNode } from 'react';
import { MonoLabel } from '@/ds';
import { useAuth } from '@/lib/auth';
import { navigate } from '@/lib/router';
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

/** Signed in (Supabase only issues sessions to confirmed emails). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) navigate('/signin');
  }, [loading, session]);

  if (loading || !session || !profile) return <Loading />;
  return <div style={{ height: '100vh', position: 'relative' }}>{children}</div>;
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
