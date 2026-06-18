import 'react-native-gesture-handler';
import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth';
import { UnreadMessagesProvider } from '../lib/UnreadMessagesContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <UnreadMessagesProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(teacher)" />
          <Stack.Screen name="(student)" />
          <Stack.Screen name="(coordinator)" />
        </Stack>
      </UnreadMessagesProvider>
    </AuthProvider>
  );
}
