import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { UserRole } from '../../../../shared/types';

const PORTAL_ROLES: UserRole[] = ['admin', 'coordinator', 'teacher'];

interface ProtectedRouteProps {
  children: ReactNode;
}

function PortalRoleGate() {
  const { profile, signOut } = useAuth();

  useEffect(() => {
    if (profile && !PORTAL_ROLES.includes(profile.role)) {
      void signOut();
    }
  }, [profile, signOut]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-6">
      <p className="text-lg font-semibold text-slate-900">Mobile App Only</p>
      <p className="mt-2 max-w-md text-center text-sm text-slate-500">
        Student accounts must use the mobile app. You have been signed out.
      </p>
      <Link to="/login" className="mt-6 text-sm font-medium text-blue-600 hover:text-green-700">
        Back to Login
      </Link>
    </div>
  );
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-6">
        <p className="text-lg font-semibold text-slate-900">Setup Incomplete</p>
        <p className="mt-2 max-w-md text-center text-sm text-slate-500">
          Your account exists but no profile was found. Contact an administrator or sign out and try again.
        </p>
      </div>
    );
  }

  if (!PORTAL_ROLES.includes(profile.role)) {
    return <PortalRoleGate />;
  }

  return <>{children}</>;
}

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  fallback?: ReactNode;
}

export function RoleGuard({ children, allowedRoles, fallback }: RoleGuardProps) {
  const { hasRole, loading, profile } = useAuth();

  if (loading) return null;

  if (!hasRole(allowedRoles)) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white p-12 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Access Denied</p>
        <p className="mt-2 text-sm text-slate-500">
          Your role ({profile?.role ?? 'unknown'}) does not have permission to view this page.
        </p>
        <Link to="/" className="mt-6 text-sm font-medium text-blue-600 hover:text-green-700">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
