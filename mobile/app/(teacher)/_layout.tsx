import { Redirect, Slot } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { DrawerLayout } from '../../components/DrawerLayout';
import { LoadingScreen } from '../../components/LoadingScreen';

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

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;

  if (profile?.role === 'admin') {
    return <Redirect href="/(auth)/login?admin=1" />;
  }

  // Shared pages (documents, groups, profile) are accessed by students
  // through the student sidebar. For those cases, render without sidebar.
  if (profile?.role !== 'teacher') {
    return (
      <View className="flex-1">
        <Slot />
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