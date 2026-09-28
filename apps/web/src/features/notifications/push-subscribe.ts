import { apiRequest } from '../../shared/lib/api-client';

/**
 * Registers this browser for Web Push so notifications reach the OS even when every Ashniva tab
 * is closed. Uses the same service worker as foreground OS banners (`/notification-sw.js`).
 *
 * Safe to call repeatedly: PushManager reuses an existing subscription, and the API upserts by
 * endpoint. Failures are swallowed — missing VAPID keys or an unsupported browser must not break
 * the shell.
 */

let subscribeInFlight: Promise<void> | null = null;

export function ensureWebPushSubscription(): Promise<void> {
  if (subscribeInFlight) {
    return subscribeInFlight;
  }
  subscribeInFlight = subscribe().finally(() => {
    subscribeInFlight = null;
  });
  return subscribeInFlight;
}

async function subscribe(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }

  let publicKey: string | null = null;
  try {
    const response = await apiRequest<{ publicKey: string | null }>(
      '/notifications/push/vapid-public-key',
    );
    publicKey = response.publicKey;
  } catch {
    return;
  }
  if (!publicKey) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/notification-sw.js');
    await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return;
    }

    await apiRequest('/notifications/push/subscribe', {
      method: 'POST',
      body: {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
    });
  } catch {
    // Permission revoked mid-flight, insecure origin, or push service refused — in-app still works.
  }
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
