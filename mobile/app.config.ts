import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Teacher Portal',
  slug: 'teacher-portal',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'teacherportal',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.example.teacherportal',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    package: 'com.example.teacherportal',
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'teacherportal',
            host: 'auth',
            pathPrefix: '/callback',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: ['expo-router'],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {
      origin: false,
    },
  },
};

/**
 * expo-notifications is intentionally omitted from plugins here so Expo Go
 * does not initialize remote push at startup. For EAS/dev-client builds, add:
 *
 * plugins: [
 *   'expo-router',
 *   ['expo-notifications', { icon: './assets/icon.png', color: '#2563eb' }],
 * ],
 */
export default config;
