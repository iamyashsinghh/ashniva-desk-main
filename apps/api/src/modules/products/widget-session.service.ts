import { createHmac, hkdfSync, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  WIDGET_SESSION_SKEW_SECONDS,
  WIDGET_SESSION_TTL_MINUTES,
  formatWidgetSessionToken,
  splitWidgetSessionToken,
  type WidgetSessionClaims,
} from '@ashniva/types';

import { AppConfigService } from '../../config/app-config.service';
import { safeEqual } from '../../common/crypto/webhook-signature';

/** Domain separation, so this key can never be the same bytes as any other use of the secret. */
const HKDF_SALT = 'ashniva.widget-session';
const HKDF_INFO = 'widget-session.v1';
const KEY_BYTES = 32;

/** Why a presented token was refused. Never told to the caller; used for logs and tests. */
export type WidgetSessionRejection =
  'malformed' | 'bad-signature' | 'expired' | 'not-yet-valid' | 'wrong-origin';

export type WidgetSessionVerdict =
  { ok: true; claims: WidgetSessionClaims } | { ok: false; reason: WidgetSessionRejection };

/**
 * Minting and verifying the token a support widget carries.
 *
 * **Signed, not stored.** A widget session is created once per page load per end user, lives for
 * fifteen minutes and is never read back by anything: nothing in Desk asks "which sessions exist".
 * A database row per session would be a write on the hot path, a table that only grows, and a
 * sweep to write — all to hold facts that are already in the token and cannot be edited there.
 *
 * The usual argument for a row is revocation, and it does not apply: every widget request re-reads
 * the product anyway, so revoking the machine credential, switching support off, or removing the
 * origin takes effect on the very next call. What a row would add is the ability to revoke *one
 * session*, which is worth less than fifteen minutes of waiting.
 *
 * The key is derived from `APP_ENCRYPTION_KEY` with HKDF rather than used directly, so a widget
 * signature can never be confused with, or forged from, anything else that key protects.
 */
@Injectable()
export class WidgetSessionService {
  private cachedKey: Buffer | null = null;

  constructor(private readonly config: AppConfigService) {}

  /** Issues a token for exactly one product, one requester and one origin. */
  mint(
    input: Omit<WidgetSessionClaims, 'v' | 'issuedAt' | 'expiresAt' | 'nonce'>,
    now = new Date(),
  ): { token: string; claims: WidgetSessionClaims } {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const claims: WidgetSessionClaims = {
      ...input,
      v: 1,
      issuedAt,
      expiresAt: issuedAt + WIDGET_SESSION_TTL_MINUTES * 60,
      nonce: randomBytes(9).toString('base64url'),
    };
    const encoded = encodeClaims(claims);
    return { token: formatWidgetSessionToken(encoded, this.sign(encoded)), claims };
  }

  /**
   * Checks a presented token against the origin the browser actually sent.
   *
   * The order is deliberate: shape, then signature, then time, then origin. Nothing after the
   * signature check is allowed to trust the claims, and nothing before it costs more than a string
   * comparison — so a flood of malformed tokens cannot be turned into work.
   *
   * The origin is compared to the one in the signature, not to a list. A token minted for
   * `https://app.example.com` is worthless on any other site even if that site is registered
   * against the same product, because the origin is part of what was signed.
   */
  verify(token: string, requestOrigin: string | undefined, now = new Date()): WidgetSessionVerdict {
    const parts = splitWidgetSessionToken(token);
    if (!parts) {
      return { ok: false, reason: 'malformed' };
    }
    if (!safeEqual(parts.signature, this.sign(parts.encodedClaims))) {
      return { ok: false, reason: 'bad-signature' };
    }
    const claims = decodeClaims(parts.encodedClaims);
    if (!claims) {
      return { ok: false, reason: 'malformed' };
    }
    const seconds = Math.floor(now.getTime() / 1000);
    if (claims.expiresAt <= seconds) {
      return { ok: false, reason: 'expired' };
    }
    if (claims.issuedAt > seconds + WIDGET_SESSION_SKEW_SECONDS) {
      return { ok: false, reason: 'not-yet-valid' };
    }
    if (!requestOrigin || requestOrigin !== claims.origin) {
      return { ok: false, reason: 'wrong-origin' };
    }
    return { ok: true, claims };
  }

  private sign(encodedClaims: string): string {
    return createHmac('sha256', this.key()).update(encodedClaims).digest('base64url');
  }

  private key(): Buffer {
    if (this.cachedKey) {
      return this.cachedKey;
    }
    const secret = this.config.encryption.key;
    if (!secret) {
      // Deliberately fatal rather than falling back to a fixed string. A predictable signing key
      // lets anybody mint a session for any product, which is worse than the feature being off.
      throw new Error('APP_ENCRYPTION_KEY is required to issue support widget sessions');
    }
    this.cachedKey = Buffer.from(
      hkdfSync('sha256', Buffer.from(secret, 'base64'), HKDF_SALT, HKDF_INFO, KEY_BYTES),
    );
    return this.cachedKey;
  }
}

/** Claims as the exact bytes that get signed. JSON, base64url, no whitespace to disagree about. */
export function encodeClaims(claims: WidgetSessionClaims): string {
  return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
}

/**
 * Parses claims that have *already* had their signature verified.
 *
 * Still validated field by field: a signature proves the bytes are ours, not that they are the
 * shape this version of the code expects. A token minted by a future version with a different
 * `v` is refused here rather than half-understood.
 */
export function decodeClaims(encoded: string): WidgetSessionClaims | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const candidate = parsed as Partial<WidgetSessionClaims>;
  const strings = [
    candidate.productId,
    candidate.organizationId,
    candidate.externalUserId,
    candidate.origin,
    candidate.keyId,
    candidate.nonce,
  ];
  if (candidate.v !== 1 || strings.some((value) => typeof value !== 'string' || value === '')) {
    return null;
  }
  if (typeof candidate.issuedAt !== 'number' || typeof candidate.expiresAt !== 'number') {
    return null;
  }
  return candidate as WidgetSessionClaims;
}
