import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isExpoGo } from './expoGo';
import { supabase } from './supabase';

export { isExpoGo };

let handlerConfigured = false;

/**
 * Registers push notifications — never loads expo-notifications in Expo Go.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (isExpoGo) {
    console.warn('Push notifications disabled in Expo Go');
    return;
  }

  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');

    if (!handlerConfigured) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      handlerConfigured = true;
    }

    if (!Device.isDevice) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const projectId =
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
      Constants.expoConfig?.extra?.eas?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId: String(projectId) } : undefined
    );

    await supabase
      .from('profiles')
      .update({ push_token: tokenData.data })
      .eq('id', userId);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }
  } catch (error) {
    console.warn('Push notification registration failed:', error);
  }
}

/**
 * Optional notification listeners — no-op in Expo Go, for dev/production builds only.
 */
export async function setupNotificationListeners(): Promise<() => void> {
  if (isExpoGo) {
    return () => undefined;
  }

  try {
    const Notifications = await import('expo-notifications');

    const received = Notifications.addNotificationReceivedListener(() => {
      // Foreground notifications — extend as needed
    });

    const response = Notifications.addNotificationResponseReceivedListener(() => {
      // User tapped notification — extend as needed
    });

    return () => {
      received.remove();
      response.remove();
    };
  } catch {
    return () => undefined;
  }
}
