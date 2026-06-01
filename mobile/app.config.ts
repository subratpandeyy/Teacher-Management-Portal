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
    bundleIdentifier: 'com.example.gcteacherportal',
  },
  android: {
    package: 'com.example.gcteacherportal',
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'gcteacherportal',
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
    eas: {
      projectId: "9a792475-1301-49bc-acf5-bc56a677dc02"
    }
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