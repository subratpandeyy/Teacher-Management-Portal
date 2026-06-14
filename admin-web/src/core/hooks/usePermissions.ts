import { useAuth } from '../auth/AuthContext';
import type { Permission } from '../permissions/permissionService';

export function usePermissions() {
  const { can, loading } = useAuth();

  const hasPermission = (permission: Permission) => {
    return can(permission);
  };

  return {
    hasPermission,
    loading,
  };
}
