import type { ColorSchemePreference } from '@ashniva/ui';

/**
 * Where a person's light/dark choice is kept.
 *
 * `localStorage`, not the session and not the server: it is a property of this browser rather
 * than of the account — the same person on a phone at night and a desktop in an office wants two
 * different answers — and it has to be readable before the first render, which a request is not.
 *
 * Reads and writes are wrapped because `localStorage` throws rather than returning null in a
 * browser configured to block site data, and a preference nobody can save is not a reason for the
 * application to fail to start.
 */
const STORAGE_KEY = 'ashniva.color-scheme';

const VALID: readonly ColorSchemePreference[] = ['light', 'dark', 'system'];

/** The stored preference, or `system` when there is none and when storage is unavailable. */
export function readColorSchemePreference(): ColorSchemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return VALID.includes(stored as ColorSchemePreference)
      ? (stored as ColorSchemePreference)
      : 'system';
  } catch {
    return 'system';
  }
}

/** Stores the preference. Silently does nothing where storage is unavailable. */
export function writeColorSchemePreference(preference: ColorSchemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // A preference that cannot be saved is still applied for this page; nothing to recover from.
  }
}
