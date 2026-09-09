import * as SecureStore from 'expo-secure-store';

/**
 * Where authentication tokens live.
 *
 * The iOS Keychain and the Android Keystore, through `expo-secure-store`. **Not AsyncStorage** —
 * that is an unencrypted file in the app's sandbox, readable on a rooted or jailbroken device and
 * present in a plain device backup. A refresh token sitting there is a long-lived credential in
 * clear text.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS means the value is unreadable while the device is
 * locked and is not carried to a new device by an iCloud restore. A session should not survive a
 * device migration: the new device should sign in.
 *
 * Every call is wrapped. Secure storage can genuinely fail — no passcode set on some Android
 * versions, a keychain error after a restore — and the app's answer to that is to treat the
 * session as absent and ask the person to sign in, not to crash on launch.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const SECURE_KEYS = {
  refreshToken: 'ashniva.refreshToken',
  /** Cached so a cold start can show the right shell before the API answers. */
  sessionUser: 'ashniva.sessionUser',
} as const;

export type SecureKey = (typeof SECURE_KEYS)[keyof typeof SECURE_KEYS];

/** True when the platform can actually store a secret. False on a simulator without a keychain. */
export async function isSecureStorageAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function readSecure(key: SecureKey): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, OPTIONS);
  } catch {
    // A value we cannot read is a value we do not have.
    return null;
  }
}

/**
 * Writes a secret, reporting whether it stuck.
 *
 * The boolean matters: if the refresh token could not be stored, staying signed in across a
 * restart is not going to work, and the caller should say so rather than discover it later.
 */
export async function writeSecure(key: SecureKey, value: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, value, OPTIONS);
    return true;
  } catch {
    return false;
  }
}

export async function deleteSecure(key: SecureKey): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, OPTIONS);
  } catch {
    // Already gone, or unreachable. Either way there is nothing further to do.
  }
}

/** Clears everything this app stores. Used on sign-out and on an expired session. */
export async function clearSecureSession(): Promise<void> {
  await Promise.all(Object.values(SECURE_KEYS).map((key) => deleteSecure(key)));
}

/** Reads and parses a JSON value, treating anything unparseable as absent. */
export async function readSecureJson<T>(key: SecureKey): Promise<T | null> {
  const raw = await readSecure(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A corrupted value is not worth keeping.
    await deleteSecure(key);
    return null;
  }
}

export function writeSecureJson(key: SecureKey, value: unknown): Promise<boolean> {
  return writeSecure(key, JSON.stringify(value));
}
