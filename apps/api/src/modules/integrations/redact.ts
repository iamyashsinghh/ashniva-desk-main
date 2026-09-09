import { createHash } from 'node:crypto';

/**
 * Keeps provider secrets and personal data out of logs, stored error messages and API responses.
 *
 * Integration code handles tokens, webhook signatures, email addresses, phone numbers and message
 * bodies. Provider SDKs and HTTP clients happily put all of those into an error's `message`, and a
 * stack trace or a logged request object then carries them to wherever logs are shipped. Every
 * error string that is persisted (`integration_connections.last_error_message`,
 * `integration_events.last_error`, `outbound_messages.last_error`) or logged goes through
 * `redactMessage` first.
 */

const REDACTED = '[redacted]';

/** Longest error we keep. Provider errors can embed a whole response body. */
const MAX_LENGTH = 500;

/**
 * Patterns for things that must never survive into a log or the database.
 * Ordered widest-first so a bearer token is caught before the generic long-token rule.
 */
const PATTERNS: readonly { readonly pattern: RegExp; readonly replace: string }[] = [
  // "Authorization: Bearer <token>" — space-separated, so it needs its own rule. Only `bearer`
  // takes the whitespace form; widening that to every keyword would redact ordinary prose such
  // as "token expired".
  { pattern: /\bbearer\s+[\w.\-+/=]+/gi, replace: `Bearer ${REDACTED}` },
  // token=<token>, "access_token": "<token>", password=…, X-Hub-Signature-256: …
  {
    pattern:
      /\b(\w*(?:token|secret|password|passwd|pwd|api[_-]?key|signature|sig))\b"?\s*[:=]\s*"?[\w.\-+/=]+"?/gi,
    replace: `$1=${REDACTED}`,
  },
  // GitHub / GitLab / Meta token shapes.
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}/g, replace: REDACTED },
  { pattern: /\bglpat-[A-Za-z0-9_-]{16,}/g, replace: REDACTED },
  { pattern: /\bEA[A-Za-z0-9]{40,}/g, replace: REDACTED },
  // JWTs.
  { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: REDACTED },
  // Email addresses and phone numbers are personal data, not secrets, but equally unwanted.
  { pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replace: REDACTED },
  { pattern: /(?<![\w.])\+\d[\d\s()-]{7,}\d(?![\w.])/g, replace: REDACTED },
  // Anything that looks like a credential in a URL: https://user:pass@host
  { pattern: /:\/\/[^/\s:@]+:[^/\s@]+@/g, replace: `://${REDACTED}@` },
];

/**
 * Strips secrets and personal data from a message and caps its length.
 * Always returns a string, so callers can use it directly in a log or a column.
 */
export function redactMessage(input: unknown): string {
  let text: string;
  if (input instanceof Error) {
    text = input.message;
  } else if (typeof input === 'string') {
    text = input;
  } else if (input === null || input === undefined) {
    return '';
  } else {
    // any: an unknown thrown value; JSON is the only safe way to get text out of it.
    try {
      text = JSON.stringify(input);
    } catch {
      text = String(input);
    }
  }

  for (const { pattern, replace } of PATTERNS) {
    text = text.replace(pattern, replace);
  }

  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}

/**
 * A stable, non-reversible label for a recipient address or phone number.
 *
 * The digest is salted with the organization so the same address in two tenants does not produce
 * the same value, which would leak that they share a contact.
 *
 * Not yet used by the outbound message rows: `outbound_messages.destination` holds the address in
 * full, because support has to answer "which address did this go to?" and a digest cannot. The
 * table is provider-only under RLS and `toOutboundMessageSummary` masks the value on the way out,
 * so it does not reach a client — but it is in the clear at rest, and this helper is what a later
 * change to that would use.
 */
export function recipientDigest(organizationId: string, address: string): string {
  return createHash('sha256')
    .update(`${organizationId}:${address.trim().toLowerCase()}`)
    .digest('hex');
}

/** Last four characters of an address, for a UI hint that identifies nothing on its own. */
export function addressHint(address: string): string {
  const trimmed = address.trim();
  return trimmed.length <= 4 ? REDACTED : `…${trimmed.slice(-4)}`;
}
