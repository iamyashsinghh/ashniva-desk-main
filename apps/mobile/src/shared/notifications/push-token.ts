import type { PushDevicePlatform } from '@ashniva/types';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * This device's Expo push token, when it can have one.
 *
 * Expo needs the EAS project id to mint a token. It is missing until `eas init` has written it
 * into `app.json`, and even with it Expo Go on Android and the iOS simulator refuse — all of which
 * are ordinary development setups, so every failure here is a quiet `null` rather than an error.
 * Alerts still reach those devices as local notifications while the app is open.
 */

/** The EAS project id from the app config, or null before `eas init`. */
export function easProjectId(): string | null {
  const eas: unknown = Constants.expoConfig?.extra?.['eas'];
  const fromExtra =
    typeof eas === 'object' && eas !== null ? (eas as Record<string, unknown>)['projectId'] : null;
  if (typeof fromExtra === 'string' && fromExtra !== '') {
    return fromExtra;
  }
  const fromEas = Constants.easConfig?.projectId;
  return typeof fromEas === 'string' && fromEas !== '' ? fromEas : null;
}

/** The platform the API files a token under, or null where native push does not exist (web). */
export function pushPlatform(): PushDevicePlatform | null {
  if (Platform.OS === 'ios') {
    return 'IOS';
  }
  if (Platform.OS === 'android') {
    return 'ANDROID';
  }
  return null;
}

/** Never throws; the caller must already hold notification permission. */
export async function expoPushToken(): Promise<string | null> {
  try {
    const projectId = easProjectId();
    if (!projectId || !pushPlatform()) {
      return null;
    }
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return typeof token.data === 'string' && token.data !== '' ? token.data : null;
  } catch {
    return null;
  }
}
