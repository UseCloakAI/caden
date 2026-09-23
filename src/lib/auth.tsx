import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data as Profile | null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Older (implicit-flow) email links put tokens in the hash, which our router would read as a route.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
    const implicit = hashParams.has('access_token') || hashParams.has('error_description');
    const returning = implicit || params.has('code') || params.has('error') || params.has('error_description');
    supabase.auth.getSession().then(async ({ data }) => {
      let session = data.session;
      if (implicit && hashParams.get('access_token') && hashParams.get('refresh_token')) {
        const { data: set } = await supabase.auth.setSession({
          access_token: hashParams.get('access_token')!,
          refresh_token: hashParams.get('refresh_token')!,
        });
        session = set.session;
      }
      // Back from a confirmation email: supabase-js has exchanged ?code= by now. Tidy the URL
      // and route on; a link opened in another browser can't be exchanged, so ask to sign in.
      if (returning) {
        window.history.replaceState(null, '', `${window.location.pathname}#/${session ? 'app' : 'signin?confirmed=1'}`);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
      setSession(session);
      await loadProfile(session?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Defer: supabase-js warns against awaiting queries inside this callback.
      setTimeout(() => loadProfile(next?.user.id), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: AuthState = {
    session,
    profile,
    loading,
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
