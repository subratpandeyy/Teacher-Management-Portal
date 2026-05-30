import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { LoadingScreen } from '../components/LoadingScreen';

export default function Index() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!session) return <Redirect href="/(auth)/login" />;

  if (profile?.role === 'admin') {
    return <Redirect href="/(auth)/login?admin=1" />;
  }

  return <Redirect href="/(teacher)/inbox" />;
}
