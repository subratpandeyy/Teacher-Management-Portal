import { useAuth } from '../auth/AuthContext';

export function useRole() {
  const { profile, loading } = useAuth();
  
  return {
    role: profile?.role ?? null,
    isAdmin: profile?.role === 'admin',
    isCoordinator: profile?.role === 'coordinator',
    isTeacher: profile?.role === 'teacher',
    isStudent: profile?.role === 'student',
    loading,
  };
}
