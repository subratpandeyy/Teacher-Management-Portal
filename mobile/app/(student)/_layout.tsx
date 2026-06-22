import { Redirect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { DrawerLayout } from '../../components/DrawerLayout';
import { LoadingScreen } from '../../components/LoadingScreen';

const MENU_ITEMS = [
  { route: '/(student)/dashboard', icon: 'home', label: 'Dashboard' },
  { route: '/(student)/inbox', icon: 'inbox', label: 'Broadcasts' },
  { route: '/(student)/chat', icon: 'message-circle', label: 'Chat' },
  { route: '/(student)/documents', icon: 'file-text', label: 'Materials' },
  { route: '/(student)/groups', icon: 'users', label: 'Groups' },
  { route: '/(student)/profile', icon: 'user', label: 'Profile' },
] as const;

export default function StudentLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (profile?.role !== 'student') return <Redirect href="/" />;

  return (
    <DrawerLayout
      menuItems={MENU_ITEMS}
      activeBgColor="#EFF6FF"
      activeTextColor="#2563EB"
      accentColor="#3B82F6"
    />
  );
}
