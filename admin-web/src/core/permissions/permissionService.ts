import type { UserRole } from '../../../../shared/types';

export type Permission =
  | 'view_analytics'
  | 'manage_users'
  | 'manage_groups'
  | 'manage_broadcasts'
  | 'manage_coordinators'
  | 'view_reports'
  | 'create_task'
  | 'update_task'
  | 'delete_task'
  | 'track_attendance'
  | 'track_progress'
  | 'upload_materials'
  | 'chat'
  | 'view_assignments'
  | 'submit_reports';

export interface User {
  id: string;
  role: UserRole;
  display_name?: string | null;
}

class PermissionService {
  private rolePermissions: Record<UserRole, Permission[]> = {
    admin: [
      'view_analytics',
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
      'manage_groups',
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

  can(user: User | null | undefined, permission: Permission): boolean {
    if (!user) return false;
    const permissions = this.rolePermissions[user.role] || [];
    return permissions.includes(permission);
  }

  hasRole(user: User | null | undefined, roles: UserRole[]): boolean {
    if (!user) return false;
    return roles.includes(user.role);
  }

  isAdmin(user: User | null | undefined): boolean {
    return user?.role === 'admin';
  }
}

export const permissionService = new PermissionService();
