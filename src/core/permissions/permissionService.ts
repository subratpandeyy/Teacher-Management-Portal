import { UserRole } from '../../../shared/types';
import { Permission, User } from '../types/auth';

export type { Permission, User };

class PermissionService {
  private rolePermissions: Record<UserRole, Permission[]> = {
    admin: [
      'view_analytics',
      'view_financials',
      'manage_users',
      'manage_groups',
      'manage_broadcasts',
      'manage_coordinators',
      'view_reports',
      'create_task',
      'update_task',
      'delete_task',
      'track_attendance',
      'track_progress',
      'upload_materials',
      'chat',
      'view_assignments',
      'submit_reports',
    ],
    coordinator: [
      'create_task',
      'update_task',
      'track_attendance',
      'track_progress',
      'submit_reports',
      'view_reports',
      'view_analytics',
      'chat',
    ],
    teacher: [
      'upload_materials',
      'track_attendance',
      'track_progress',
      'chat',
    ],
    student: [
      'view_assignments',
      'track_attendance',
      'track_progress',
      'chat',
    ],
  };

  /**
   * Check if a user has a specific permission
   */
  can(user: User | null | undefined, permission: Permission): boolean {
    if (!user) return false;
    
    const permissions = this.rolePermissions[user.role] || [];
    return permissions.includes(permission);
  }

  /**
   * Check if a user has any of the given roles
   */
  hasRole(user: User | null | undefined, roles: UserRole[]): boolean {
    if (!user) return false;
    return roles.includes(user.role);
  }

  /**
   * Check if user is an admin
   */
  isAdmin(user: User | null | undefined): boolean {
    return user?.role === 'admin';
  }
}

export const permissionService = new PermissionService();
