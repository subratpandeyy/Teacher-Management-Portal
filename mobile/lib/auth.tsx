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
import type { UserRole } from '../../shared/types';
import { permissionService, type Permission } from '../core/permissions/permissionService';

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
    displayName: string,
    role: UserRole
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  can: (permission: Permission) => boolean;
  hasRole: (roles: UserRole[]) => boolean;
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

  const loadProfile = useCallback(async (userId: string, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, display_name, push_token, deleted_at')
        .eq('id', userId)
        .single();

      if (!error && data) {
        if (data.deleted_at) {
          console.warn(`[auth] mobile user ${userId} has been soft-deleted. Logging out.`);
          await supabase.auth.signOut();
          setProfile(null);
          return;
        }
        setProfile(data as Profile);
        return;
      }

      if (i < retries - 1) {
        // Wait 500ms before retry to allow trigger to finish
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    
    console.warn(`[auth] profile not found for user ${userId} after ${retries} attempts`);
    setProfile(null);
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
    let mounted = true;

    async function initializeAuth() {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(initialSession);
        if (initialSession?.user) {
          await loadProfile(initialSession.user.id);
        }
      } catch (err) {
        console.error('[auth] initialization error', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initializeAuth();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (__DEV__) console.log('[auth] onAuthStateChange', event);

      if (!mounted) return;

      // Avoid full-screen loading flashes on token refresh or duplicate init events
      if (event === 'TOKEN_REFRESHED') {
        setSession(nextSession);
        return;
      }
      if (event === 'INITIAL_SESSION') {
        setSession(nextSession);
        return;
      }

      setSession(nextSession);

      if (nextSession?.user) {
        const showLoader = event === 'SIGNED_IN';
        if (showLoader) setLoading(true);
        await loadProfile(nextSession.user.id, event === 'SIGNED_IN' ? 3 : 1);
        if (mounted && showLoader) setLoading(false);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
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
    async (email: string, password: string, displayName: string, role: UserRole) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName, role: role },
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

  const can = useCallback(
    (permission: Permission) => {
      if (!profile) return false;
      return permissionService.can(profile as any, permission);
    },
    [profile]
  );

  const hasRole = useCallback(
    (roles: UserRole[]) => {
      if (!profile) return false;
      return roles.includes(profile.role as UserRole);
    },
    [profile]
  );

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
      can,
      hasRole,
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
      can,
      hasRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
