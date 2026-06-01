import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../lib/auth';
import { LoadingScreen } from '../../components/LoadingScreen';

function TabLabel({ title, focused }: { title: string; focused: boolean }) {
  return (
    <Text className={focused ? 'text-brand-600 font-semibold' : 'text-slate-500'}>
      {title}
    </Text>
  );
}

export default function TeacherLayout() {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (profile?.role !== 'teacher') {
    return <Redirect href="/(auth)/login?admin=1" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#f8fafc' },
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => (
          <Text onPress={() => signOut()} className="mr-4 text-brand-600">
            Sign out
          </Text>
        ),
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#64748b',
      }}
    >
      <Tabs.Screen name="inbox" options={{ title: 'Messages', tabBarLabel: ({ focused }) => <TabLabel title="Inbox" focused={focused} /> }} />
      <Tabs.Screen name="documents" options={{ title: 'Documents', tabBarLabel: ({ focused }) => <TabLabel title="Docs" focused={focused} /> }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarLabel: ({ focused }) => <TabLabel title="Chat" focused={focused} /> }} />
      <Tabs.Screen name="availability" options={{ title: 'Availability', tabBarLabel: ({ focused }) => <TabLabel title="Calendar" focused={focused} /> }} />
    </Tabs>
  );
}
