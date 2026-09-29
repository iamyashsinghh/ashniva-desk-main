import type { RegisterPushDeviceRequest, UnregisterPushDeviceRequest } from '@ashniva/types';
import * as Notifications from 'expo-notifications';

import { apiRequest } from '../api/client';
import { expoPushToken, pushPlatform } from './push-token';

/**
 * Asking this device for permission to show notifications, and filing its push token with the API.
 *
 * Permission is requested once somebody has signed in — they know by then what the app is for —
 * and again from the Profile screen's "enable" button, not on the login screen, where the answer
 * is usually no and the platform never asks again. `registerIfPermitted` files the token when
 * permission was granted earlier and never shows a prompt.
 *
 * The token is filed against the signed-in caller (`POST /notifications/push/devices`) and
 * forgotten on sign-out (`unregisterPushDevice`), so a shared phone stops receiving the previous
 * person's alerts. The API upserts on the token, so registering again for a new user moves it.
 */

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface PushRegistration {
  permission: PushPermission;
  /** The token, when one could be obtained. Never logged. */
  token: string | null;
  /** Whether the API accepted the token. False on simulators and before `eas init`. */
  registered: boolean;
}

/** Sign-out must not wait on a slow network; the server drops dead tokens on its own anyway. */
const UNREGISTER_TIMEOUT_MS = 4_000;

/** The token the API last accepted from this process, so sign-out knows what to forget. */
let registeredToken: string | null = null;

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
 * Asks for permission and, if granted, registers the device.
 *
 * Never throws. Push is a nicety: an app that fails to start because a simulator has no push
 * support is worse than an app with no notifications.
 */
export async function registerForPush(): Promise<PushRegistration> {
  try {
    let status = await currentPushPermission();
    if (status === 'undetermined') {
      const asked = await Notifications.requestPermissionsAsync();
      status = toPermission(asked.status);
    }
    if (status !== 'granted') {
      return { permission: status, token: null, registered: false };
    }
    return await registerGranted();
  } catch {
    return { permission: 'unavailable', token: null, registered: false };
  }
}

/** Registers the device only if permission was already granted. Never prompts, never throws. */
export async function registerIfPermitted(): Promise<PushRegistration> {
  const status = await currentPushPermission();
  if (status !== 'granted') {
    return { permission: status, token: null, registered: false };
  }
  return registerGranted();
}

/**
 * Tells the API to stop pushing to this device. Call it *before* signing out — the request needs
 * the caller's access token.
 *
 * Never throws and never takes longer than a few seconds: sign-out must always complete, and a
 * token the server keeps by mistake is dropped the first time Expo reports it undeliverable.
 */
export async function unregisterPushDevice(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) {
    return;
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve();
    }, UNREGISTER_TIMEOUT_MS);
  });
  const body: UnregisterPushDeviceRequest = { token };
  const request = apiRequest<void>('/notifications/push/devices/unregister', {
    method: 'POST',
    body,
    signal: controller.signal,
  }).catch(() => undefined);
  try {
    await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function registerGranted(): Promise<PushRegistration> {
  const token = await expoPushToken();
  const platform = pushPlatform();
  if (!token || !platform) {
    return { permission: 'granted', token: null, registered: false };
  }
  const body: RegisterPushDeviceRequest = { token, platform };
  try {
    await apiRequest<void>('/notifications/push/devices', { method: 'POST', body });
    registeredToken = token;
    return { permission: 'granted', token, registered: true };
  } catch {
    return { permission: 'granted', token, registered: false };
  }
}

/** Test hook: resets module state between cases. Never called by the app. */
export function resetPushRegistrationForTests(): void {
  registeredToken = null;
}

function toPermission(status: string): PushPermission {
  if (status === 'granted') {
    return 'granted';
  }
  if (status === 'denied') {
    return 'denied';
  }
  return 'undetermined';
}
