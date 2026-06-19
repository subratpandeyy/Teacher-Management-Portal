import { Redirect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { DrawerLayout } from '../../components/DrawerLayout';
import { LoadingScreen } from '../../components/LoadingScreen';

const MENU_ITEMS = [
  { route: '/(student)/dashboard', icon: 'home', label: 'Dashboard' },
  { route: '/(student)/chat', icon: 'message-circle', label: 'Chat' },
  { route: '/(teacher)/documents', icon: 'file-text', label: 'Materials' },
  { route: '/(teacher)/groups', icon: 'users', label: 'Groups' },
  { route: '/(teacher)/profile', icon: 'user', label: 'Profile' },
] as const;

export default function StudentLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (profile?.role !== 'student') return <Redirect href="/" />;

  return (
    <DrawerLayout
      menuItems={MENU_ITEMS}
      activeBgColor="#ECFDF5"
      activeTextColor="#059669"
      accentColor="#059669"
    />
  );
}
