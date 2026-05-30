import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { createSessionFromUrl } from '../../lib/deepLinkAuth';
import { LoadingScreen } from '../../components/LoadingScreen';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handleUrl(url: string) {
      const result = await createSessionFromUrl(url);
      if (cancelled) return;

      if (result.ok) {
        router.replace('/(teacher)/inbox');
        return;
      }

      setError(result.error ?? 'Could not complete sign in');
    }

    void Linking.getInitialURL().then((url) => {
      if (url) {
        void handleUrl(url);
        return;
      }
      setError('No verification link was received. Open the link from your email on this device.');
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router]);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6">
        <Text className="text-center text-lg font-semibold text-slate-900">
          Sign-in failed
        </Text>
        <Text className="mt-2 text-center text-slate-600">{error}</Text>
        <Text
          className="mt-6 text-brand-600"
          onPress={() => router.replace('/(auth)/login')}
        >
          Back to login
        </Text>
      </View>
    );
  }

  return <LoadingScreen label="Completing sign in…" />;
}
