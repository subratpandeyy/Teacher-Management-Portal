import type { UserRole } from '../../shared/types';

/** Home route after login / email verification, keyed by role. */
export function getHomeRouteForRole(role: UserRole | string | undefined): string {
  switch (role) {
    case 'student':
      return '/(student)/dashboard';
    case 'admin':
      return '/(auth)/login?admin=1';
    case 'coordinator':
    case 'teacher':
    default:
      return '/(teacher)/inbox';
  }
}
