import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getAuthRedirectUrl } from './authRedirect';
import { subscribeToAuthDeepLinks } from './deepLinkAuth';
import { isExpoGo } from './expoGo';
import { supabase, type Profile } from './supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authRedirectUrl: string;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const authRedirectUrl = useMemo(() => getAuthRedirectUrl(), []);

  useEffect(() => {
    if (__DEV__) {
      console.log('[auth] Supabase emailRedirectTo:', authRedirectUrl);
    }
  }, [authRedirectUrl]);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, display_name, push_token')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('loadProfile', error.message);
      setProfile(null);
      return;
    }
    setProfile(data as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await loadProfile(session.user.id);
    }
  }, [loadProfile, session?.user?.id]);

  // Deep links: email verification, magic links → app session
  useEffect(() => {
    return subscribeToAuthDeepLinks((result) => {
      if (!result.ok && result.error) {
        console.warn('Auth deep link:', result.error);
      }
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Push: only in dev/production builds, never in Expo Go, never at module scope
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || isExpoGo) {
      if (userId && isExpoGo) {
        console.warn('Push notifications disabled in Expo Go');
      }
      return;
    }

    let active = true;
    let removeListeners: (() => void) | undefined;

    (async () => {
      try {
        const { registerForPushNotifications, setupNotificationListeners } =
          await import('./notifications');
        if (!active) return;
        await registerForPushNotifications(userId);
        removeListeners = await setupNotificationListeners();
      } catch (err) {
        console.warn('Could not load push notifications module', err);
      }
    })();

    return () => {
      active = false;
      removeListeners?.();
    };
  }, [session?.user?.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName, role: 'teacher' },
          emailRedirectTo: authRedirectUrl,
        },
      });
      return { error: error?.message ?? null };
    },
    [authRedirectUrl]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      authRedirectUrl,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [
      session,
      profile,
      loading,
      authRedirectUrl,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
