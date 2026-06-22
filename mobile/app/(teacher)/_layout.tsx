import { Feather } from '@expo/vector-icons';
import { Redirect, Slot, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { DrawerLayout } from '../../components/DrawerLayout';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Logo } from '../../components/Logo';
import { getHomeRouteForRole } from '../../lib/routing';

const MENU_ITEMS = [
  { route: '/(teacher)/inbox', icon: 'inbox', label: 'Dashboard' },
  { route: '/(teacher)/documents', icon: 'file-text', label: 'Materials' },
  { route: '/(teacher)/groups', icon: 'users', label: 'Groups' },
  { route: '/(teacher)/chat', icon: 'message-circle', label: 'Chat' },
  { route: '/(teacher)/availability', icon: 'calendar', label: 'Calendar' },
  { route: '/(teacher)/profile', icon: 'user', label: 'Profile' },
] as const;

export default function TeacherLayout() {
  const { session, profile, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;

  if (profile?.role === 'admin') {
    return <Redirect href="/(auth)/login?admin=1" />;
  }

  if (profile?.role !== 'teacher') {
    const initial = (profile?.display_name ?? '').charAt(0).toUpperCase() || '?';
    const homeRoute = getHomeRouteForRole(profile?.role);

    return (
      <View className="flex-1">
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
          <View className="flex-row items-center px-4 py-3">
            <Pressable
              onPress={() => router.back()}
              accessibilityLabel="Go back"
              accessibilityRole="button"
              className="mr-2 rounded-xl p-2 active:bg-slate-100"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="arrow-left" size={22} color="#475569" />
            </Pressable>
            <Logo size={56} />
            <View className="flex-1" />
            <Pressable
              onPress={() => router.push(homeRoute as any)}
              accessibilityLabel="Go to home"
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-full bg-blue-100 active:bg-blue-200"
            >
              <Text className="text-sm font-bold text-blue-600">{initial}</Text>
            </Pressable>
          </View>
        </View>
        <View className="flex-1 bg-slate-50">
          <Slot />
        </View>
      </View>
    );
  }

  return (
    <DrawerLayout
      menuItems={MENU_ITEMS}
      activeBgColor="#DBEAFE"
      activeTextColor="#2563EB"
      accentColor="#3B82F6"
    />
  );
}
