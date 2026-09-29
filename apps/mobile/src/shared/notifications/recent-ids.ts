/**
 * A bounded set of recently seen ids.
 *
 * The same alert can reach the phone twice: once over the realtime socket (shown as a local
 * notification) and once as a remote push. Whichever arrives second is recognised here and not
 * shown again. Bounded because the app can stay open for days, and only the last few alerts can
 * still be racing each other.
 */
export interface RecentIds {
  has: (id: string) => boolean;
  /** Records the id. Returns false when it was already there — the caller has a duplicate. */
  add: (id: string) => boolean;
  clear: () => void;
}

export function createRecentIds(limit = 50): RecentIds {
  // A Set iterates in insertion order, so its first entry is always the oldest.
  const ids = new Set<string>();
  return {
    has: (id) => ids.has(id),
    add: (id) => {
      if (ids.has(id)) {
        return false;
      }
      ids.add(id);
      if (ids.size > limit) {
        const oldest = ids.values().next();
        if (!oldest.done) {
          ids.delete(oldest.value);
        }
      }
      return true;
    },
    clear: () => ids.clear(),
  };
}
