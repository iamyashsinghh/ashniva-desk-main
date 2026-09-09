import type { Request } from 'express';

import { refreshCookieOptions } from './auth-cookies';

/**
 * A request as Express hands it over, with `secure` already decided.
 *
 * That is the whole point of the trust-proxy setting: Express computes `req.secure` from the
 * connection *and* from `X-Forwarded-Proto` when — and only when — a proxy is trusted. These
 * cases stand in for the two sides of that decision; the e2e test drives the real Express.
 */
function requestWith(options: { secure: boolean; forwardedProto?: string }): Request {
  return {
    secure: options.secure,
    headers: options.forwardedProto ? { 'x-forwarded-proto': options.forwardedProto } : {},
  } as unknown as Request;
}

describe('refreshCookieOptions', () => {
  it('is httpOnly and SameSite=strict whatever the scheme', () => {
    const options = refreshCookieOptions(requestWith({ secure: false }));
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('strict');
    expect(options.path).toBe('/api/v1/auth');
  });

  it('drops Secure on plain http, so the local preview still works', () => {
    expect(refreshCookieOptions(requestWith({ secure: false })).secure).toBe(false);
  });

  it('sets Secure on a direct TLS connection', () => {
    expect(refreshCookieOptions(requestWith({ secure: true })).secure).toBe(true);
  });

  it('sets Secure behind a trusted proxy, where Express has believed X-Forwarded-Proto', () => {
    // With TRUST_PROXY set, Express makes req.secure true from the forwarded header.
    expect(
      refreshCookieOptions(requestWith({ secure: true, forwardedProto: 'https' })).secure,
    ).toBe(true);
  });

  it('ignores X-Forwarded-Proto when Express did not believe it', () => {
    // The case that separates this implementation from the one it replaced. `main` read the
    // header itself — `request.secure || headers['x-forwarded-proto'] === 'https'` — so any
    // client could assert the scheme of its own request and mark the refresh cookie Secure.
    // Express has already made that decision from TRUST_PROXY; secure:false with the header
    // present means it was sent by somebody we do not trust, and it must not count.
    //
    // The test above passes under both implementations. This one only passes under this one.
    expect(
      refreshCookieOptions(requestWith({ secure: false, forwardedProto: 'https' })).secure,
    ).toBe(false);
  });

  it('carries the requested lifetime, and none when it is not asked for', () => {
    expect(refreshCookieOptions(requestWith({ secure: true }), 60_000).maxAge).toBe(60_000);
    expect(refreshCookieOptions(requestWith({ secure: true })).maxAge).toBeUndefined();
  });
});
