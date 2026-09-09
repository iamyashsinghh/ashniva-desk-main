import { randomBytes } from 'node:crypto';

import {
  WIDGET_SESSION_PREFIX,
  WIDGET_SESSION_TTL_MINUTES,
  formatWidgetSessionToken,
  normalizeOrigin,
} from '@ashniva/types';

import type { AppConfigService } from '../../config/app-config.service';
import { encodeClaims, WidgetSessionService } from './widget-session.service';

const KEY = randomBytes(32).toString('base64');

/**
 * A stub rather than the real config: this file is about the token, and standing up Nest's
 * configuration to read one string would test the framework instead.
 */
function service(key: string | null = KEY): WidgetSessionService {
  const config = { encryption: { key: key ?? undefined } } as AppConfigService;
  return new WidgetSessionService(config);
}

const claims = {
  productId: 'product-1',
  organizationId: 'org-1',
  externalUserId: 'carelix-user-42',
  origin: 'https://app.example.com',
  keyId: 'key-1',
};

describe('widget session tokens', () => {
  it('mints a token with the browser-safe prefix and the configured lifetime', () => {
    const now = new Date('2026-09-17T09:00:00.000Z');
    const { token, claims: minted } = service().mint(claims, now);

    expect(token.startsWith(`${WIDGET_SESSION_PREFIX}_`)).toBe(true);
    expect(minted.expiresAt - minted.issuedAt).toBe(WIDGET_SESSION_TTL_MINUTES * 60);
    // Minutes, not hours. A token that outlived the page it was minted for would be a standing
    // key into the ticket queue.
    expect(WIDGET_SESSION_TTL_MINUTES).toBeLessThanOrEqual(30);
  });

  it('accepts its own token from the origin it was minted for', () => {
    const sessions = service();
    const { token } = sessions.mint(claims);
    const verdict = sessions.verify(token, claims.origin);

    expect(verdict).toMatchObject({ ok: true });
    expect(verdict.ok && verdict.claims.externalUserId).toBe('carelix-user-42');
  });

  /**
   * Each refusal on its own. A test that changed two things at once would still pass if only one
   * of the checks were left, which is exactly the regression worth catching.
   */
  it('refuses a token from a different origin', () => {
    const sessions = service();
    const { token } = sessions.mint(claims);
    expect(sessions.verify(token, 'https://evil.example.com')).toEqual({
      ok: false,
      reason: 'wrong-origin',
    });
    expect(sessions.verify(token, undefined)).toEqual({ ok: false, reason: 'wrong-origin' });
  });

  it('refuses an expired token', () => {
    const sessions = service();
    const minted = new Date('2026-09-17T09:00:00.000Z');
    const { token } = sessions.mint(claims, minted);
    const later = new Date(minted.getTime() + (WIDGET_SESSION_TTL_MINUTES + 1) * 60_000);

    expect(sessions.verify(token, claims.origin, later)).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses a token minted with a different key', () => {
    const { token } = service(randomBytes(32).toString('base64')).mint(claims);
    expect(service().verify(token, claims.origin)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  /**
   * The claims are the signed material, so editing any of them invalidates the signature. This is
   * what makes "wrong product" and "wrong requester" unforgeable rather than merely checked: there
   * is no way to present a token that says something the server did not say.
   */
  it('refuses a token whose product or requester has been edited', () => {
    const sessions = service();
    const { token } = sessions.mint(claims);
    const signature = token.split('.').slice(1).join('.');

    for (const tampered of [
      { ...claims, productId: 'another-product' },
      { ...claims, externalUserId: 'somebody-else' },
      { ...claims, organizationId: 'another-org' },
    ]) {
      const forged = formatWidgetSessionToken(
        encodeClaims({
          ...tampered,
          v: 1,
          issuedAt: Math.floor(Date.now() / 1000),
          expiresAt: Math.floor(Date.now() / 1000) + 600,
          nonce: 'n',
        }),
        signature,
      );
      expect(sessions.verify(forged, claims.origin)).toEqual({
        ok: false,
        reason: 'bad-signature',
      });
    }
  });

  it('refuses anything that is not shaped like a token, without touching the key', () => {
    const sessions = service();
    for (const bad of ['', 'bearer', 'ask_key.secret', 'askp_nodot', 'askp_.sig', 'askp_claims.']) {
      expect(sessions.verify(bad, claims.origin)).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('refuses to mint at all without an encryption key', () => {
    expect(() => service(null).mint(claims)).toThrow('APP_ENCRYPTION_KEY');
  });
});

describe('origin normalisation', () => {
  it('reduces equivalent spellings to one string', () => {
    expect(normalizeOrigin('https://App.Example.com/')).toBe('https://app.example.com');
    expect(normalizeOrigin('  https://app.example.com  ')).toBe('https://app.example.com');
    expect(normalizeOrigin('https://app.example.com:8443')).toBe('https://app.example.com:8443');
  });

  it('refuses anything that is not an origin', () => {
    for (const bad of [
      'https://app.example.com/support',
      'https://*.example.com',
      '*',
      'http://app.example.com',
      'ftp://app.example.com',
      'app.example.com',
      'https://user:pass@app.example.com',
      'https://app.example.com?x=1',
      '',
    ]) {
      expect(normalizeOrigin(bad)).toBeNull();
    }
  });

  it('allows plain HTTP on loopback only, where every integrator develops', () => {
    expect(normalizeOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(normalizeOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });
});
