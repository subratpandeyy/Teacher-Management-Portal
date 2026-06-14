import { Redirect, Slot } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { LoadingScreen } from '../../components/LoadingScreen';

export default function StudentLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (profile?.role !== 'student') return <Redirect href="/" />;

  return <Slot />;
}
