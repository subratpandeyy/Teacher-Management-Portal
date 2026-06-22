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
      style={{
        paddingTop: insets.top,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
      }}
    >
      <View className="flex-row items-center justify-between px-4 py-3">
        <Logo size={65} />
        <Pressable
          accessibilityLabel="Profile"
          className="h-9 w-9 items-center justify-center rounded-full bg-blue-100 active:bg-blue-200"
          onPress={() => {
            router.push('/(teacher)/profile' as never);
          }}
        >
          <Text className="text-sm font-bold text-blue-600">{initial}</Text>
        </Pressable>
      </View>
    </View>
  );
}
