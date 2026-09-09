/**
 * Where a theme comes from, and — when it comes from somewhere Desk does not control — what is
 * still missing before it can.
 *
 * Modelled on the IVR readiness report for the same reason: the honest answer to "is this
 * integration finished?" is a list, it belongs next to the switch that governs it rather than
 * only in a document, and a vendor half that nobody has supplied should be visible rather than
 * guessed at.
 */

export const THEME_SOURCE_KEY = {
  /** The organization's own stored branding. Desk's behaviour before any of this existed. */
  LOCAL: 'local',
  /** An Ashniva Theme Manager deployment. */
  REMOTE: 'remote',
} as const;

export type ThemeSourceKey = (typeof THEME_SOURCE_KEY)[keyof typeof THEME_SOURCE_KEY];

/** One thing the Theme Manager team has to supply, and what specifically is wanted. */
export interface ThemeMissingRequirement {
  key: string;
  /** What is absent, in a sentence an administrator can act on. */
  what: string;
  /** The specific answers required, one per line. */
  needs: string[];
}

export interface ThemeSourceReadiness {
  source: ThemeSourceKey;
  /** True only when this source can actually produce a theme document. */
  healthy: boolean;
  /** What is built and working on Desk's side of the boundary. */
  ready: string[];
  /** What is not, and who owes it. Empty for the local source. */
  missing: ThemeMissingRequirement[];
  /** What Desk does while `missing` is non-empty — stated, because the failure is quiet by design. */
  behaviourWhenUnready: string;
  /** When a document was last served from the cache or the remote, ISO-8601, or null. */
  lastDocumentAt: string | null;
}
