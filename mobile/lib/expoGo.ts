import Constants from 'expo-constants';

/** True when running inside the Expo Go client. */
export const isExpoGo = Constants.appOwnership === 'expo';
