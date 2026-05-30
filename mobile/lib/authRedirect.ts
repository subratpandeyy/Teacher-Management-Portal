import * as Linking from 'expo-linking';

/**
 * Deep link used for Supabase email confirmation, magic links, and password recovery.
 * Example: teacherportal://auth/callback (standalone)
 *          exp://192.168.x.x:8081/--/auth/callback (Expo Go)
 */
export function getAuthRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

/**
 * URLs to allow in Supabase Dashboard → Authentication → Redirect URLs.
 * Run getAuthRedirectUrl() once in dev and add the printed Expo Go URL if it differs.
 */
export function getSupabaseRedirectAllowList(): string[] {
  return [
    getAuthRedirectUrl(),
    'teacherportal://auth/callback',
    'teacherportal://**',
    'exp://**/--/auth/callback',
    'exp://**',
  ];
}
