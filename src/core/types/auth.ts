import { UserRole } from '../../../shared/types';

export type Permission =
  | 'view_analytics'
  | 'view_financials'
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
  display_name?: string;
}
