import type { ThemeDocument } from '@ashniva/types';

export interface CachedThemeDocument {
  document: ThemeDocument;
  storedAt: Date;
}

/**
 * The last theme document that was known to be good, per organization.
 *
 * In process, not in Redis, and that is a deliberate limit rather than an oversight: this cache
 * exists so that a Theme Manager outage costs nothing, and a cache that itself depends on another
 * service reachable over the network would reintroduce exactly the dependency it is removing.
 * The cost is that each API instance warms its own copy, which is one extra request per instance
 * per TTL — cheap, and the whole point of `docs/theme-manager-integration.md` asking about
 * invalidation is to decide whether that stays acceptable.
 *
 * `get` and `getStale` are separate on purpose. A fresh entry is served outright; a stale one is
 * still worth serving while a refresh runs, because a document from an hour ago is closer to the
 * tenant's intent than the built-in default theme is.
 */
export class ThemeDocumentCache {
  private readonly entries = new Map<string, CachedThemeDocument>();

  constructor(private readonly ttlMs: number) {}

  /** The entry, only while it is within its TTL. */
  get(key: string, now = new Date()): CachedThemeDocument | null {
    const entry = this.entries.get(key);
    if (!entry || now.getTime() - entry.storedAt.getTime() > this.ttlMs) {
      return null;
    }
    return entry;
  }

  /** The entry whatever its age — what is served while a refresh is in flight. */
  getStale(key: string): CachedThemeDocument | null {
    return this.entries.get(key) ?? null;
  }

  set(key: string, document: ThemeDocument, now = new Date()): void {
    this.entries.set(key, { document, storedAt: now });
  }

  clear(): void {
    this.entries.clear();
  }
}
