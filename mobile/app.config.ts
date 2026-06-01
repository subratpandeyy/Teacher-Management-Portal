import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'GenieClasses Teacher Portal',
  slug: 'gc-teacher-portal',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/logo.png',
  userInterfaceStyle: 'light',
  scheme: 'gc-teacher-portal',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.example.gc-teacher-portal',
  },
  android: {
    package: 'com.example.gc-teacher-portal',
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'gc-teacher-portal',
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
