import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { UserRole, Profile } from '../../../../shared/types';
import { permissionService, type Permission } from '../permissions/permissionService';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  can: (permission: Permission) => boolean;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(initialSession);
      if (initialSession?.user) {
        await fetchProfile(initialSession.user.id);
      } else if (mounted) {
        setLoading(false);
      }
    }

    void initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;

      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        setSession(nextSession);
        return;
      }

      setSession(nextSession);
      if (nextSession?.user) {
        const showLoader = event === 'SIGNED_IN';
        if (showLoader) setLoading(true);
        await fetchProfile(nextSession.user.id, event === 'SIGNED_IN' ? 3 : 1);
        if (mounted && showLoader) setLoading(false);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function fetchProfile(userId: string, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (!error && data) {
          if (data.deleted_at) {
            console.warn(`[auth] user ${userId} has been soft-deleted. Logging out.`);
            await supabase.auth.signOut();
            setProfile(null);
            setLoading(false);
            return;
          }
          setProfile(data as Profile);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      }

      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.warn(`[auth] profile not found for user ${userId}`);
    setProfile(null);
    setLoading(false);
  }

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const can = (permission: Permission) => {
    return permissionService.can(profile as any, permission);
  };

  const hasRole = (roles: UserRole[]) => {
    return permissionService.hasRole(profile as any, roles);
  };

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signOut,
    can,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
