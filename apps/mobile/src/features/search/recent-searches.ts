import { useCallback, useSyncExternalStore } from 'react';

/**
 * The last few terms somebody searched for, for one tap back to them.
 *
 * Held in memory only, per signed-in person, and gone when the app is closed. Written to disk
 * they would outlive a sign-out on a shared phone, and a search term is often a client's name or
 * the title of their ticket — the API refuses to audit terms for the same reason, and a plain
 * file in the app's sandbox would be a worse place to keep them than the log it declined to write.
 */

const MAX_RECENT = 6;
const EMPTY: readonly string[] = [];

const byUser = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Newest first, compared without case, so "Acme" after "acme" moves it up rather than doubling it. */
export function rememberSearch(userId: string, term: string): void {
  const trimmed = term.trim();
  if (!trimmed) {
    return;
  }
  const previous = byUser.get(userId) ?? EMPTY;
  const rest = previous.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
  byUser.set(userId, [trimmed, ...rest].slice(0, MAX_RECENT));
  emit();
}

export function clearRecentSearches(userId: string): void {
  byUser.delete(userId);
  emit();
}

export function useRecentSearches(userId: string | null): readonly string[] {
  const snapshot = useCallback(() => (userId ? (byUser.get(userId) ?? EMPTY) : EMPTY), [userId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
