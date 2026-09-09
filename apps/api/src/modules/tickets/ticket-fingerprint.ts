import { extractErrorCode, extractKeywords, ticketFingerprint } from '@ashniva/types';

/**
 * The two matching columns a ticket carries: `keywords` and `fingerprint`.
 *
 * Computed here, once, at every point a ticket is written — the internal desk, the portal and the
 * product ingress all end up in this function. Computing them on read instead would mean the GIN
 * index on `keywords` had nothing to index, which is the whole reason they are columns.
 *
 * The functions themselves are pure and live in `@ashniva/types`, so this costs microseconds and
 * is done synchronously inside the same call that creates the ticket. A queued job would buy
 * nothing and would leave a window in which a brand-new ticket matches nothing.
 */

export interface TicketFingerprintSource {
  title: string;
  description: string;
  module: string | null;
  productId: string | null;
  productVersion: string | null;
}

export interface TicketFingerprintColumns {
  keywords: string[];
  fingerprint: string;
}

/**
 * The module is fed to the keyword extractor as well as to the fingerprint.
 *
 * Two reports of the same fault often disagree about everything except the area they were filed
 * against, and the fingerprint only matches when *all four* of its parts agree — so a module that
 * contributed nothing to the keywords would be wasted on exactly the pairs it identifies best.
 */
export function fingerprintTicket(source: TicketFingerprintSource): TicketFingerprintColumns {
  const errorCode = extractErrorCode(source.title, source.description);
  return {
    keywords: extractKeywords(source.title, source.description, source.module),
    fingerprint: ticketFingerprint({
      productId: source.productId,
      module: source.module,
      productVersion: source.productVersion,
      errorCode,
    }),
  };
}

/** How many parts `ticketFingerprint` joins, and which of them is the error code. */
const FINGERPRINT_PARTS = 4;
const ERROR_CODE_PART = 3;

/**
 * The error code out of a stored fingerprint, or null.
 *
 * The fingerprint is a readable join rather than a hash precisely so that it can be read, and
 * reading the code back out of it is what lets the candidate query stay cheap: ranking needs the
 * code, and re-deriving it would mean loading every candidate's full description to scan it again.
 * `extractErrorCode` upper-cases what it finds, so upper-casing the part restores it exactly.
 */
export function errorCodeFromFingerprint(fingerprint: string | null): string | null {
  if (!fingerprint) {
    return null;
  }
  const parts = fingerprint.split('|');
  if (parts.length !== FINGERPRINT_PARTS) {
    return null;
  }
  const code = parts[ERROR_CODE_PART];
  return !code || code === '-' ? null : code.toUpperCase();
}
