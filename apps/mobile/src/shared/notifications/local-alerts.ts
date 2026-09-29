import type { NativePushData } from '@ashniva/types';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { alertKey, pushAlertKey, type LiveAlert } from './notification-payload';
import { createRecentIds, type RecentIds } from './recent-ids';

/**
 * Showing alerts on the device while the app is open.
 *
 * A remote push needs an EAS project, APNs/FCM credentials and a real device. A local notification
 * needs none of them, so each `notification.new` from the realtime socket is echoed as one: alerts
 * then work in Expo Go and on a simulator, and on a production build they arrive even when the
 * remote push is slow. The same alert can therefore arrive twice, and `presented` is what makes
 * the second one silent — whichever of the two came first wins.
 */

/** The Android channel both the local echo and the API's remote pushes are posted to. */
export const ANDROID_CHANNEL_ID = 'default';

const LOCAL_PREFIX = 'local-';
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 400;

const presented = createRecentIds(50);
let handlerInstalled = false;

/**
 * Whether an incoming notification should be shown.
 *
 * Our own local echo is always shown — its key was recorded when it was scheduled. Anything else
 * is shown unless the same alert was already presented; a push with no id is shown, since there
 * is nothing to match it against.
 */
export function shouldPresent(identifier: string, data: unknown, seen: RecentIds): boolean {
  if (identifier.startsWith(LOCAL_PREFIX)) {
    return true;
  }
  const key = pushAlertKey(data);
  return key ? seen.add(key) : true;
}

/**
 * How an alert that arrives while the app is open is treated: a banner, only its sound (the app
 * is already showing it its own way), or nothing at all.
 */
export type ForegroundTreatment = 'show' | 'sound-only' | 'hide';

/** Installs the foreground presentation rule once per process. */
export function installForegroundHandler(
  treat: (data: unknown) => ForegroundTreatment = () => 'show',
): void {
  if (handlerInstalled) {
    return;
  }
  try {
    Notifications.setNotificationHandler({
      handleNotification: (notification) => {
        const { data } = notification.request.content;
        const fresh = shouldPresent(notification.request.identifier, data, presented);
        const treatment = fresh ? treat(data) : 'hide';
        return Promise.resolve({
          shouldShowBanner: treatment === 'show',
          shouldShowList: treatment === 'show',
          shouldPlaySound: treatment !== 'hide',
          shouldSetBadge: true,
        });
      },
    });
    handlerInstalled = true;
  } catch {
    // No notification module (an unusual test or web build): nothing to present with anyway.
  }
}

/**
 * Android 8+ drops a notification posted to a channel that does not exist. HIGH importance is
 * what makes it a heads-up banner rather than a silent entry in the shade.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch {
    // The OS falls back to Expo's own channel; the alert is quieter but still delivered.
  }
}

/** The tap payload of a local echo: the same shape the API puts in a remote push. */
type LocalPushData = Omit<NativePushData, 'type'> & { type: string };

/** Shows a live alert now, unless the same notification was already presented. */
export async function presentLocalAlert(alert: LiveAlert): Promise<void> {
  const key = alertKey(alert.notificationId, alert.groupedCount);
  if (!presented.add(key)) {
    return;
  }
  const data: LocalPushData = {
    notificationId: alert.notificationId,
    groupedCount: alert.groupedCount ?? 1,
    type: alert.type,
    link: alert.link,
    entityType: alert.entityType,
    entityId: alert.entityId,
  };
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `${LOCAL_PREFIX}${key}`,
      content: {
        title: clip(alert.title, MAX_TITLE_LENGTH),
        body: alert.body ? clip(alert.body, MAX_BODY_LENGTH) : null,
        data: { ...data },
        sound: 'default',
        ...(alert.unreadCount !== null ? { badge: alert.unreadCount } : {}),
      },
      trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null,
    });
  } catch {
    // Presentation failing is not worth surfacing: the inbox and the tab badge still update.
  }
}

/** Sets the number on the app icon. Unsupported launchers and denied permission are ignored. */
export function setAppBadge(count: number): void {
  try {
    Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count))).catch(() => undefined);
  } catch {
    // The module is missing its badge support on this platform.
  }
}

/** Forgets what was shown, so a different person signing in on this phone starts clean. */
export function clearPresentedAlerts(): void {
  presented.clear();
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
