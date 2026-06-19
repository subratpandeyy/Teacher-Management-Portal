import { Redirect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { DrawerLayout } from '../../components/DrawerLayout';
import { LoadingScreen } from '../../components/LoadingScreen';

const MENU_ITEMS = [
  { route: '/(coordinator)/dashboard', icon: 'home', label: 'Dashboard' },
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
      activeBgColor="#ECFDF5"
      activeTextColor="#059669"
      accentColor="#10B981"
    />
  );
}
