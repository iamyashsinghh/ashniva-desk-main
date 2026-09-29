import { File, Paths } from 'expo-file-system';
import { useMemo, useSyncExternalStore } from 'react';

import { isWallpaperColorToken, type WallpaperColorToken } from './wallpaper-colors';

/**
 * What is drawn behind a conversation, on this device.
 *
 * A device preference rather than an account setting: it is somebody's taste on one phone, the API
 * has no reason to hold it, and a photo from the camera roll should not be uploaded to be one.
 * There is one wallpaper for every chat and, optionally, one per conversation that wins over it.
 *
 * Kept as a JSON file in the documents folder, like the install marker — the app has no
 * AsyncStorage, and a preference does not belong in the Keychain. A chosen picture is copied into
 * the documents folder too, because the picker's own copy is in a cache the system may empty; the
 * copy is deleted as soon as no wallpaper uses it any more.
 */

export type ChatWallpaper =
  { kind: 'none' } | { kind: 'color'; token: WallpaperColorToken } | { kind: 'image'; uri: string };

/**
 * On disk an image is its file name, not its URI. The absolute path of the documents folder
 * changes when iOS moves the app's container on an update, and a stored path would then point at
 * nothing; the name inside the folder does not change.
 */
type StoredWallpaper =
  | { kind: 'none' }
  | { kind: 'color'; token: WallpaperColorToken }
  | { kind: 'image'; file: string };

interface Preferences {
  global: StoredWallpaper;
  overrides: Readonly<Record<string, StoredWallpaper>>;
}

const PREFERENCES_FILE = 'chat-wallpaper.json';
const IMAGE_PREFIX = 'chat-wallpaper-';
const NONE: StoredWallpaper = { kind: 'none' };
const EMPTY: Preferences = { global: NONE, overrides: {} };

let preferences: Preferences | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

function current(): Preferences {
  preferences ??= readPreferences();
  return preferences;
}

function readPreferences(): Preferences {
  try {
    const file = new File(Paths.document, PREFERENCES_FILE);
    return file.exists ? parsePreferences(JSON.parse(file.textSync())) : EMPTY;
  } catch {
    // An unreadable preference is no wallpaper, not a crash on the way into a conversation.
    return EMPTY;
  }
}

function parsePreferences(raw: unknown): Preferences {
  if (typeof raw !== 'object' || raw === null) {
    return EMPTY;
  }
  const { global, overrides } = raw as { global?: unknown; overrides?: unknown };
  const parsed: Record<string, StoredWallpaper> = {};
  if (typeof overrides === 'object' && overrides !== null) {
    for (const [conversationId, value] of Object.entries(overrides)) {
      const wallpaper = parseStored(value);
      if (wallpaper) {
        parsed[conversationId] = wallpaper;
      }
    }
  }
  return { global: parseStored(global) ?? NONE, overrides: parsed };
}

function parseStored(raw: unknown): StoredWallpaper | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const value = raw as { kind?: unknown; token?: unknown; file?: unknown };
  if (value.kind === 'none') {
    return NONE;
  }
  if (value.kind === 'color' && isWallpaperColorToken(value.token)) {
    return { kind: 'color', token: value.token };
  }
  if (value.kind === 'image' && typeof value.file === 'string' && isOwnImageName(value.file)) {
    return { kind: 'image', file: value.file };
  }
  return null;
}

/** Only names this store wrote, so a tampered file cannot point it at anything else to delete. */
function isOwnImageName(name: string): boolean {
  return name.startsWith(IMAGE_PREFIX) && !name.includes('/');
}

function resolve(stored: StoredWallpaper): ChatWallpaper {
  if (stored.kind !== 'image') {
    return stored;
  }
  const file = new File(Paths.document, stored.file);
  return file.exists ? { kind: 'image', uri: file.uri } : { kind: 'none' };
}

function overrideIn(prefs: Preferences, conversationId: string | undefined) {
  return conversationId !== undefined && Object.hasOwn(prefs.overrides, conversationId)
    ? prefs.overrides[conversationId]
    : undefined;
}

function effective(prefs: Preferences, conversationId: string | undefined): StoredWallpaper {
  return overrideIn(prefs, conversationId) ?? prefs.global;
}

function imagesIn(prefs: Preferences): Set<string> {
  const names = new Set<string>();
  for (const wallpaper of [prefs.global, ...Object.values(prefs.overrides)]) {
    if (wallpaper.kind === 'image') {
      names.add(wallpaper.file);
    }
  }
  return names;
}

/** A picture already in the documents folder is reused; anything else is copied in first. */
async function adopt(value: ChatWallpaper): Promise<StoredWallpaper> {
  if (value.kind !== 'image') {
    return value;
  }
  const existing = value.uri.split('/').pop() ?? '';
  if (isOwnImageName(existing) && new File(Paths.document, existing).uri === value.uri) {
    return { kind: 'image', file: existing };
  }
  sequence += 1;
  const extension = /\.(jpe?g|png|webp|heic|gif)$/i.exec(value.uri)?.[0] ?? '.jpg';
  const name = `${IMAGE_PREFIX}${Date.now().toString(36)}-${sequence}${extension.toLowerCase()}`;
  await new File(value.uri).copy(new File(Paths.document, name));
  return { kind: 'image', file: name };
}

function commit(next: Preferences): void {
  const before = imagesIn(current());
  preferences = next;
  try {
    new File(Paths.document, PREFERENCES_FILE).write(JSON.stringify(next));
  } catch {
    // Still applied for this session; it just will not survive a restart.
  }
  const after = imagesIn(next);
  for (const name of before) {
    if (!after.has(name)) {
      deleteQuietly(name);
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

function deleteQuietly(name: string): void {
  try {
    const file = new File(Paths.document, name);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // A copy left behind costs some storage; failing the change over it would cost more.
  }
}

/**
 * Sets the wallpaper for every chat, or for one conversation when an id is given.
 *
 * Rejects only when a chosen picture could not be copied, in which case nothing has changed.
 */
export async function setWallpaper(value: ChatWallpaper, conversationId?: string): Promise<void> {
  const stored = await adopt(value);
  const prefs = current();
  commit(
    conversationId
      ? { ...prefs, overrides: { ...prefs.overrides, [conversationId]: stored } }
      : { ...prefs, global: stored },
  );
}

/** Makes a conversation follow the wallpaper every other chat has again. */
export function clearOverride(conversationId: string): void {
  const prefs = current();
  if (!overrideIn(prefs, conversationId)) {
    return;
  }
  const { [conversationId]: _removed, ...rest } = prefs.overrides;
  commit({ ...prefs, overrides: rest });
}

/** The wallpaper a conversation is drawn with: its own, or else the one for every chat. */
export function getChatWallpaper(conversationId?: string): ChatWallpaper {
  return resolve(effective(current(), conversationId));
}

export function hasWallpaperOverride(conversationId: string): boolean {
  return overrideIn(current(), conversationId) !== undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `getChatWallpaper`, re-rendering the caller whenever a wallpaper changes anywhere. */
export function useChatWallpaper(conversationId?: string): ChatWallpaper {
  const prefs = useSyncExternalStore(subscribe, current);
  return useMemo(() => resolve(effective(prefs, conversationId)), [prefs, conversationId]);
}

/** Whether this conversation has a wallpaper of its own, kept current like `useChatWallpaper`. */
export function useHasWallpaperOverride(conversationId: string | undefined): boolean {
  const prefs = useSyncExternalStore(subscribe, current);
  return overrideIn(prefs, conversationId) !== undefined;
}

/** Test hook: forgets what was read, so the next read comes from disk. Never called by the app. */
export function resetWallpaperStoreForTests(): void {
  preferences = null;
  listeners.clear();
}
