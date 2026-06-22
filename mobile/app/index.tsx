import { View, Text, Pressable } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { LoadingScreen } from '../components/LoadingScreen';
import { supabase } from '../lib/supabase';

export default function Index() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!session) return <Redirect href="/(auth)/login" />;

  // If session exists but profile is missing after retries, 
  // we might be in a broken state or the user is not in profiles.
  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center p-6 bg-white">
        <View className="items-center rounded-2xl bg-slate-50 p-8 border border-slate-100">
          <Text className="text-xl font-bold text-slate-900">Setup Incomplete</Text>
          <Text className="mt-3 text-center text-slate-500 leading-5">
            We've logged you in, but we couldn't find your profile. This usually happens if there was an error during registration.
          </Text>
          <Pressable 
            onPress={() => supabase.auth.signOut()}
            className="mt-8 w-full rounded-xl bg-blue-500 py-3.5 items-center active:bg-blue-600"
          >
            <Text className="font-bold text-white">Sign Out & Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (profile.role === 'admin') {
    return <Redirect href="/(auth)/login?admin=1" />;
  }

  if (profile?.role === 'student') {
    return <Redirect href="/(student)/dashboard" />;
  }

  if (profile?.role === 'coordinator') {
    return <Redirect href={"/(coordinator)/dashboard" as any} />;
  }

  return <Redirect href="/(teacher)/inbox" />;
}
