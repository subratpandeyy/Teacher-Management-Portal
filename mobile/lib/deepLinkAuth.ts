import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase } from './supabase';

function isAuthCallbackUrl(url: string): boolean {
  return (
    url.includes('auth/callback') ||
    url.includes('access_token=') ||
    url.includes('refresh_token=') ||
    url.includes('code=') ||
    url.includes('type=signup') ||
    url.includes('type=recovery')
  );
}

/**
 * Parses tokens or PKCE code from a Supabase auth redirect and persists the session.
 */
export async function createSessionFromUrl(url: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const { params, errorCode } = QueryParams.getQueryParams(url);

    if (errorCode) {
      return { ok: false, error: errorCode };
    }

    const access_token = params.access_token;
    const refresh_token = params.refresh_token;

    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    const code = params.code;
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    return { ok: false, error: 'No auth tokens found in redirect URL' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown auth redirect error';
    return { ok: false, error: message };
  }
}

/**
 * Subscribes to deep links that complete Supabase auth (email verification, etc.).
 */
export function subscribeToAuthDeepLinks(
  onHandled?: (result: { ok: boolean; error?: string }) => void
): () => void {
  const handleUrl = async (url: string | null) => {
    if (!url || !isAuthCallbackUrl(url)) return;

    const result = await createSessionFromUrl(url);
    onHandled?.(result);
  };

  void Linking.getInitialURL().then((url) => handleUrl(url));

  const subscription = Linking.addEventListener('url', ({ url }) => {
    void handleUrl(url);
  });

  return () => subscription.remove();
}
