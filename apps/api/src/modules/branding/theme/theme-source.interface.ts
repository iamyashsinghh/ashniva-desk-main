import type { ThemeDocument, ThemeSourceKey, ThemeSourceReadiness } from '@ashniva/types';

/** Injection token for the configured theme source, chosen by `THEME_PROVIDER`. */
export const THEME_SOURCE = Symbol('THEME_SOURCE');

/** Which organization a theme is being resolved for. */
export interface ThemeContext {
  organizationId: string;
  organizationSlug: string;
}

/**
 * Where a theme document comes from.
 *
 * The seam exists so that "the organization's stored branding" and "a document published by
 * another product" are the same thing to everything above it. `BrandingService` layers whatever
 * comes back over the stored branding and over the built-in defaults, so a source that returns
 * nothing is an ordinary outcome rather than an error.
 *
 * Two rules bind every implementation, and both are about the sign-in page:
 *
 *  * **`load` never throws.** It is called from `GET /branding`, which is `@Public()` and is the
 *    first request the web app makes. An implementation that can reject can take the sign-in page
 *    down, and a theme has no business doing that.
 *  * **`load` never waits on a network round trip.** A source that reaches outside the deployment
 *    serves what it already has and refreshes in the background, so an unreachable Theme Manager
 *    costs staleness rather than latency.
 */
export interface ThemeSource {
  readonly key: ThemeSourceKey;

  /** The document for this organization, or null when this source has none. Never rejects. */
  load(context: ThemeContext): Promise<ThemeDocument | null>;

  /** What works, what is missing, and what happens meanwhile. Never rejects. */
  readiness(context: ThemeContext | null): Promise<ThemeSourceReadiness>;
}
