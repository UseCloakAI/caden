import { useEffect, type ReactNode } from 'react';
import { ToastProvider } from '@/ds';
import { useAuth } from '@/lib/auth';
import { navigate } from '@/lib/router';
import { OfficeProvider, useOffice } from '@/lib/office';
import { useRoute } from '@/lib/router';
import { Onboarding } from './office/Onboarding';
import { JoinScreen } from './office/JoinScreen';
import { Shell } from './Shell';
import { Loading } from './Loading';
import './product.css';

/** Signed in (Supabase only issues sessions to confirmed emails). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) navigate('/signin');
  }, [loading, session]);

  if (loading || !session || !profile) return <Loading label={loading ? 'Signing you in' : 'Opening your office'} />;
  return <>{children}</>;
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
    <ToastProvider>
      <RequireAuth>
        <OfficeProvider>
          <OfficeGate />
        </OfficeProvider>
      </RequireAuth>
    </ToastProvider>
  );
}
