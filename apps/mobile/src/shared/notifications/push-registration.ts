import * as Notifications from 'expo-notifications';

/**
 * Asking this device for permission to show notifications.
 *
 * Permission is requested when it will make sense to the person — after they have seen a ticket
 * or a task — not on first launch, when the answer is usually no and the platform never asks
 * again.
 *
 * The token stops here. Registering a device with the API needs a device table and a push channel
 * that do not exist yet; see the note further down for what is owed.
 */

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface PushRegistration {
  permission: PushPermission;
  /** The token, when one could be obtained. Never logged. */
  token: string | null;
}

/** What the platform currently thinks, without asking the person anything. */
export async function currentPushPermission(): Promise<PushPermission> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return toPermission(status);
  } catch {
    return 'unavailable';
  }
}

/**
 * Asks for permission and, if granted, gets a token.
 *
 * Never throws. Push is a nicety: an app that fails to start because a simulator has no push
 * support is worse than an app with no notifications.
 */
export async function registerForPush(): Promise<PushRegistration> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = toPermission(existing.status);

    if (status === 'undetermined') {
      const asked = await Notifications.requestPermissionsAsync();
      status = toPermission(asked.status);
    }
    if (status !== 'granted') {
      return { permission: status, token: null };
    }

    const token = await Notifications.getExpoPushTokenAsync();
    return { permission: 'granted', token: token.data };
  } catch {
    return { permission: 'unavailable', token: null };
  }
}

/*
 * There is deliberately nothing here that sends the token anywhere.
 *
 * `sendPushTokenToApi` used to POST the token to `/notifications/devices`, a route the API has
 * never had, and swallowed the 404 — so every launch quietly failed to register and the app said
 * "This device will receive alerts" about a device the server had never heard of. Pretending is
 * worse than not doing it: nobody investigates a feature they believe is working.
 *
 * What the API would need before this comes back: a device table keyed on (user, token) with the
 * platform and a last-seen timestamp; a route to register and to forget one, scoped to the caller
 * so a token cannot be filed against somebody else; a push channel in `NOTIFICATION_CHANNELS`
 * beside the e-mail and WhatsApp ones, so a person's per-type preferences decide what is pushed;
 * and expiry handling, because a token that stops working has to be dropped rather than retried.
 * The mobile app is another workstream's, so that lands with it rather than here.
 */

function toPermission(status: string): PushPermission {
  if (status === 'granted') {
    return 'granted';
  }
  if (status === 'denied') {
    return 'denied';
  }
  return 'undetermined';
}
