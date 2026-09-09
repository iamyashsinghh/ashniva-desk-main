import { REFRESH_TOKEN_COOKIE } from '@ashniva/types';
import * as SecureStore from 'expo-secure-store';

import { SECURE_KEYS } from '../../shared/storage/secure-store';
import { login, logout, restoreSession } from './auth-api';
import { getAccessToken, getSession, resetSessionForTests, setSession } from './session-store';

/**
 * Signing in, restoring and signing out.
 *
 * The distinction these tests exist for: a refused refresh means the session is gone and the
 * person is signed out; an unreachable server does not, and they stay signed in with a warning.
 * Getting that backwards means either a security hole or an app that logs people out in a lift.
 */

const mocked = SecureStore as unknown as { __store: Map<string, string> };

const user = {
  id: 'u1',
  email: 'a@b.com',
  name: 'A',
  title: null,
  roleKey: 'DEVELOPER',
  roleId: 'r1',
  roleName: 'Developer',
  isCustomRole: false,
  permissions: [],
  showDevelopmentSection: true,
  organization: { id: 'o1', name: 'Org', slug: 'org', isServiceProvider: true },
  organizations: [],
} as unknown as Parameters<typeof setSession>[1];

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  mocked.__store.clear();
  resetSessionForTests();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('login', () => {
  it('stores the access token in memory and the refresh token in the keychain', async () => {
    fetchMock.mockResolvedValueOnce(
      response(
        200,
        { accessToken: 'access-1', user },
        { 'set-cookie': `${REFRESH_TOKEN_COOKIE}=refresh-1; Path=/auth; HttpOnly` },
      ),
    );

    await expect(login('a@b.com', 'password1234')).resolves.toMatchObject({ id: 'u1' });

    expect(getAccessToken()).toBe('access-1');
    expect(mocked.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-1');
    expect([...mocked.__store.values()].join(' ')).not.toContain('access-1');
  });

  it('does not say whether the email exists', async () => {
    fetchMock.mockResolvedValueOnce(response(401, { statusCode: 401, message: 'Unauthorized' }));

    await expect(login('nobody@example.com', 'password1234')).rejects.toThrow(
      'That email and password did not match',
    );
  });

  it('says the server could not be reached, rather than blaming the password', async () => {
    fetchMock.mockRejectedValueOnce(new Error('no network'));

    await expect(login('a@b.com', 'password1234')).rejects.toThrow('Could not reach the server');
  });

  it('leaves no session behind when sign-in fails', async () => {
    fetchMock.mockResolvedValueOnce(response(401, { statusCode: 401, message: 'Unauthorized' }));

    await login('a@b.com', 'wrong').catch(() => undefined);
    expect(getSession()).toBeNull();
    expect(mocked.__store.size).toBe(0);
  });
});

describe('restoreSession', () => {
  it('is signed out when nothing was stored', async () => {
    await expect(restoreSession()).resolves.toEqual({ status: 'signed-out' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges a stored token for a live session', async () => {
    mocked.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    fetchMock.mockResolvedValueOnce(
      response(
        200,
        { accessToken: 'access-2', user },
        { 'set-cookie': `${REFRESH_TOKEN_COOKIE}=refresh-2; Path=/auth` },
      ),
    );

    await expect(restoreSession()).resolves.toMatchObject({ status: 'signed-in' });
    expect(getAccessToken()).toBe('access-2');
    // Rotated: the old token is spent.
    expect(mocked.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-2');
  });

  it('signs out when the API refuses the stored token', async () => {
    // Revoked, expired or reused. This is not a network problem, so it is a real sign-out.
    mocked.__store.set(SECURE_KEYS.refreshToken, 'revoked');
    fetchMock.mockResolvedValueOnce(response(401, { statusCode: 401, message: 'Revoked' }));

    await expect(restoreSession()).resolves.toEqual({ status: 'signed-out' });
    expect(mocked.__store.size).toBe(0);
  });

  it('stays signed in from cache when the server cannot be reached', async () => {
    // Losing your session because you opened the app on the underground is not a security win.
    mocked.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    mocked.__store.set(SECURE_KEYS.sessionUser, JSON.stringify(user));
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    const result = await restoreSession();
    expect(result.status).toBe('offline');
    expect(mocked.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-1');
  });

  it('is signed out when offline with no cached user to fall back to', async () => {
    mocked.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    await expect(restoreSession()).resolves.toEqual({ status: 'signed-out' });
  });

  it('proves the stored token before claiming to be signed in', async () => {
    // A stored token is not evidence of a live session; it may have been revoked elsewhere.
    mocked.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    fetchMock.mockResolvedValueOnce(response(200, { accessToken: 'a', user }));

    await restoreSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/refresh');
  });
});

describe('logout', () => {
  it('tells the server and then clears everything', async () => {
    await setSession('access-1', user, 'refresh-1');
    fetchMock.mockResolvedValueOnce(response(204, null));

    await logout();

    expect(getSession()).toBeNull();
    expect(mocked.__store.size).toBe(0);
  });

  it('signs out locally even when the server cannot be told', async () => {
    // Somebody who taps sign out on a train must end up signed out.
    await setSession('access-1', user, 'refresh-1');
    fetchMock.mockRejectedValue(new Error('offline'));

    await logout();

    expect(getSession()).toBeNull();
    expect(mocked.__store.size).toBe(0);
  });
});
