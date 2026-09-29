import { File, Paths } from 'expo-file-system';

import { clearSecureSession } from './secure-store';

const MARKER_NAME = 'ashniva-installed';

/**
 * Makes deleting the app sign the person out.
 *
 * The iOS Keychain outlives the app: delete it, reinstall it, and the refresh token from the old
 * install is still there, so the new install opens signed in as whoever used the phone before.
 * The app's documents folder, unlike the Keychain, goes with the app. A marker file there that
 * is missing therefore means this is a fresh install, and anything left in secure storage belongs
 * to a previous one and is cleared before the session is restored.
 *
 * On Android the Keystore is removed with the app already; the check is harmless there.
 *
 * The marker is written before anything is cleared, and a marker that cannot be read or written
 * leaves the session alone: clearing without a marker to show for it would sign the person out
 * on every launch, which is the opposite of the point.
 */
export async function forgetPreviousInstall(): Promise<void> {
  try {
    const marker = new File(Paths.document, MARKER_NAME);
    if (marker.exists) {
      return;
    }
    marker.write(new Date().toISOString());
    if (!new File(Paths.document, MARKER_NAME).exists) {
      return;
    }
  } catch {
    return;
  }
  await clearSecureSession();
}
