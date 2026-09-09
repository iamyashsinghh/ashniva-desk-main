/**
 * The browser half of product support.
 *
 * A machine credential (`ask_…`) is argon2id-verified and is the customer's *server* secret. It
 * must never reach a browser: anything shipped in page JavaScript is readable by every visitor,
 * and a leaked `ask_` key raises tickets against the product for as long as nobody notices.
 *
 * So the widget gets its own kind of credential. The customer's backend presents its `ask_` key
 * once and is handed a short-lived, single-purpose token for **one identified end user, on one
 * origin, for one product**. That token is what the page holds. It cannot be used to raise a
 * ticket for another product, as another requester, or from another site, because each of those
 * facts is inside the signature rather than in the request.
 *
 * The prefix is `askp_` — `p` for public — for the same reason `ask_` exists at all: a secret that
 * leaks into a log, a paste or a bug report is only actionable if somebody can recognise it, and
 * one grep has to be able to tell a browser token apart from a server credential. They have very
 * different blast radii and very different remedies (wait fifteen minutes, versus rotate the key).
 */

/** The prefix every browser-safe widget session token carries. */
export const WIDGET_SESSION_PREFIX = 'askp';

/**
 * How long a minted widget session stays valid.
 *
 * Minutes, not hours. The token is the whole authority the page holds, it lives in browser memory
 * where an XSS on the customer's site can read it, and re-minting costs the customer's backend one
 * call. A short window is the difference between "somebody stole a support session" and "somebody
 * has a standing key into our ticket queue".
 */
export const WIDGET_SESSION_TTL_MINUTES = 15;

/** Clock skew tolerated between the minting server and a verifying one. */
export const WIDGET_SESSION_SKEW_SECONDS = 60;

/** The most origins one product may register. A list, never a pattern — see `normalizeOrigin`. */
export const MAX_PRODUCT_ALLOWED_ORIGINS = 20;

/** The longest a single origin string may be. */
export const MAX_ORIGIN_LENGTH = 200;

/**
 * What a widget session token asserts.
 *
 * Every field is a *restriction*, not a convenience: the ingress reads the product, the requester
 * and the origin from here and refuses anything the request says to the contrary. Widening this
 * shape widens what a stolen token can do, so nothing goes in it that the server can look up.
 */
export interface WidgetSessionClaims {
  /** Format version, so a later scheme can be told apart rather than guessed at. */
  v: 1;
  productId: string;
  organizationId: string;
  /** The customer's own identifier for the person the widget is open for. Opaque to Desk. */
  externalUserId: string;
  /** The exact origin the browser must present. Never a pattern, never a wildcard. */
  origin: string;
  /** Which machine credential minted this. The public half only. */
  keyId: string;
  /** Unix seconds. */
  issuedAt: number;
  /** Unix seconds. */
  expiresAt: number;
  /** Makes two tokens minted in the same second distinguishable in a log. */
  nonce: string;
}

/**
 * Reduces a browser origin to the one string that may be compared with `===`.
 *
 * Origins are compared exactly, and this is what makes that safe. `https://Example.com/`,
 * `https://example.com` and `https://example.com:443` are the same origin and have to normalise
 * to one spelling, or an operator who typed the trailing slash would find the widget silently
 * refused. Anything carrying a path, a query, credentials or a wildcard is rejected outright
 * rather than trimmed: those are not origins, and quietly accepting a near-miss is how a check
 * ends up passing something nobody meant to allow.
 *
 * Plain HTTP is accepted only for loopback, where there is no network to eavesdrop on and where
 * every developer runs the customer application they are integrating.
 */
export function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ORIGIN_LENGTH || trimmed.includes('*')) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    return null;
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol === 'http:') {
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]' && host !== '::1') {
      return null;
    }
  } else if (url.protocol !== 'https:') {
    return null;
  }
  return `${url.protocol}//${url.host.toLowerCase()}`;
}

/** Normalises a list, drops what does not parse, and removes duplicates. */
export function normalizeOrigins(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const origin = normalizeOrigin(value);
    if (origin) {
      seen.add(origin);
    }
  }
  return [...seen];
}

/** `askp_<claims>.<signature>`, both base64url. Assembled here so one file owns the shape. */
export function formatWidgetSessionToken(encodedClaims: string, signature: string): string {
  return `${WIDGET_SESSION_PREFIX}_${encodedClaims}.${signature}`;
}

/**
 * Splits a presented token into the part that was signed and the signature over it.
 *
 * Returns null for anything that is not the right shape, so a malformed header is refused before
 * any HMAC is computed and before the claims are parsed as JSON.
 */
export function splitWidgetSessionToken(
  token: string,
): { encodedClaims: string; signature: string } | null {
  const trimmed = token.trim();
  const prefix = `${WIDGET_SESSION_PREFIX}_`;
  if (!trimmed.startsWith(prefix)) {
    return null;
  }
  const body = trimmed.slice(prefix.length);
  const dot = body.indexOf('.');
  if (dot <= 0 || dot === body.length - 1) {
    return null;
  }
  return { encodedClaims: body.slice(0, dot), signature: body.slice(dot + 1) };
}
