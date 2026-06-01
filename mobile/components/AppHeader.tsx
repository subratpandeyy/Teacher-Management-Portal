import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { Logo } from './Logo';

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, user } = useAuth();
  const initial = (profile?.display_name ?? user?.email ?? 'T').charAt(0).toUpperCase();

  return (
    <View
      className="border-b border-slate-100 bg-white"
      style={{ paddingTop: insets.top, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 }}
    >
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Logo size={65} />
        {/* <Text className="flex-1 text-md font-semibold leading-tight text-slate-900" numberOfLines={2}>
          Teachers Portal
        </Text> */}
        {/* <Pressable
          accessibilityLabel="Notifications"
          className="rounded-full p-2 active:bg-slate-50"
          onPress={() => {}}
        >
          <Feather name="bell" size={20} color="#64748B" />
        </Pressable> */}
        {/* <Pressable
          accessibilityLabel="Profile"
          className="h-9 w-9 items-center justify-center rounded-full bg-accent-blue-100"
          onPress={() => {
            // Profile tab route (expo typed routes may lag until next `expo start`)
            router.push('/(teacher)/profile' as never);
          }}
        >
          <Text className="text-sm font-bold text-accent-blue-700">{initial}</Text>
        </Pressable> */}
      </View>
    </View>
  );
}
