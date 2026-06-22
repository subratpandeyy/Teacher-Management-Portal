import { Redirect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { DrawerLayout } from '../../components/DrawerLayout';
import { LoadingScreen } from '../../components/LoadingScreen';

const MENU_ITEMS = [
  { route: '/(coordinator)/dashboard', icon: 'home', label: 'Dashboard' },
  { route: '/(coordinator)/inbox', icon: 'inbox', label: 'Broadcasts' },
  { route: '/(coordinator)/students', icon: 'users', label: 'Students' },
  { route: '/(coordinator)/teachers', icon: 'award', label: 'Teachers' },
  { route: '/(coordinator)/tasks', icon: 'check-square', label: 'Tasks' },
  { route: '/(coordinator)/attendance', icon: 'clipboard', label: 'Attendance' },
  { route: '/(coordinator)/groups', icon: 'users', label: 'Groups' },
  { route: '/(coordinator)/chat', icon: 'message-circle', label: 'Chat' },
  { route: '/(coordinator)/work', icon: 'trending-up', label: 'Work Tracking' },
  { route: '/(coordinator)/profile', icon: 'user', label: 'Profile' },
] as const;

export default function CoordinatorLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (profile?.role !== 'coordinator') {
    return <Redirect href="/" />;
  }

  return (
    <DrawerLayout
      menuItems={MENU_ITEMS}
      sidebarTitle="Coordinator Panel"
      activeBgColor="#EFF6FF"
      activeTextColor="#2563EB"
      accentColor="#3B82F6"
    />
  );
}
