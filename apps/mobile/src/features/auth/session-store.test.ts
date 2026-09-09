import { REFRESH_TOKEN_COOKIE } from '@ashniva/types';
import * as SecureStore from 'expo-secure-store';

import { SECURE_KEYS } from '../../shared/storage/secure-store';
import {
  clearSession,
  getAccessToken,
  getCachedUser,
  getSession,
  getStoredRefreshToken,
  hasPermission,
  refreshCookieHeader,
  refreshTokenFromSetCookie,
  resetSessionForTests,
  setSession,
  subscribeToSession,
} from './session-store';

const mocked = SecureStore as unknown as { __store: Map<string, string> };

const user = {
  id: 'u1',
  email: 'priya@example.com',
  name: 'Priya Sharma',
  title: null,
  roleKey: 'DEVELOPER',
  roleId: 'r1',
  roleName: 'Developer',
  isCustomRole: false,
  permissions: ['task:read', 'task:work'],
  showDevelopmentSection: true,
  organization: { id: 'o1', name: 'Ashniva', slug: 'ashniva', isServiceProvider: true },
  organizations: [],
} as unknown as Parameters<typeof setSession>[1];

beforeEach(() => {
  mocked.__store.clear();
  resetSessionForTests();
});

describe('where each token goes', () => {
  it('keeps the access token in memory and never writes it down', async () => {
    // Fifteen minutes of life; writing it to disk would outlive its usefulness and its safety.
    await setSession('access-token', user, 'refresh-token');

    expect(getAccessToken()).toBe('access-token');
    expect([...mocked.__store.values()].join(' ')).not.toContain('access-token');
  });

  it('writes the refresh token to secure storage', async () => {
    await setSession('access-token', user, 'refresh-token');
    expect(mocked.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-token');
    await expect(getStoredRefreshToken()).resolves.toBe('refresh-token');
  });

  it('caches the user so a cold start can paint the right shell', async () => {
    await setSession('access-token', user, 'refresh-token');
    await expect(getCachedUser()).resolves.toMatchObject({ id: 'u1', name: 'Priya Sharma' });
  });

  it('keeps the stored refresh token when a refresh does not rotate it', async () => {
    await setSession('access-1', user, 'refresh-1');
    await setSession('access-2', user, null);

    expect(getAccessToken()).toBe('access-2');
    expect(mocked.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-1');
  });
});

describe('signing out', () => {
  it('clears memory and storage', async () => {
    await setSession('access-token', user, 'refresh-token');
    await clearSession();

    expect(getSession()).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(mocked.__store.size).toBe(0);
  });

  it('tells subscribers, so the app can leave a screen it should not be on', async () => {
    const seen: (unknown | null)[] = [];
    subscribeToSession((session) => seen.push(session));

    await setSession('access-token', user, 'refresh-token');
    await clearSession();

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeNull();
  });

  it('stops telling a subscriber that unsubscribed', async () => {
    let calls = 0;
    const unsubscribe = subscribeToSession(() => {
      calls += 1;
    });
    unsubscribe();

    await setSession('access-token', user, 'refresh-token');
    expect(calls).toBe(0);
  });
});

describe('permissions', () => {
  it('answers from the signed-in session', async () => {
    await setSession('access-token', user, 'refresh-token');
    expect(hasPermission('task:work')).toBe(true);
    expect(hasPermission('user:manage')).toBe(false);
  });

  it('answers false when nobody is signed in', () => {
    expect(hasPermission('task:read')).toBe(false);
  });
});

describe('the refresh cookie', () => {
  it('reads the token out of a Set-Cookie header', () => {
    const header = `${REFRESH_TOKEN_COOKIE}=abc123; Path=/auth; HttpOnly; SameSite=Strict`;
    expect(refreshTokenFromSetCookie(header)).toBe('abc123');
  });

  it('finds it among several cookies concatenated by React Native', () => {
    // RN joins multiple Set-Cookie headers with commas, and an Expires attribute contains one —
    // which is why this matches by name rather than splitting.
    const header = [
      'other=1; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/',
      `${REFRESH_TOKEN_COOKIE}=abc123; Path=/auth; HttpOnly`,
    ].join(', ');
    expect(refreshTokenFromSetCookie(header)).toBe('abc123');
  });

  it('returns null when the header has no refresh cookie', () => {
    expect(refreshTokenFromSetCookie('session=1; Path=/')).toBeNull();
    expect(refreshTokenFromSetCookie(null)).toBeNull();
  });

  it('builds the Cookie header the API expects, and nothing when there is no token', () => {
    expect(refreshCookieHeader('abc123')).toBe(`${REFRESH_TOKEN_COOKIE}=abc123`);
    expect(refreshCookieHeader(null)).toBeNull();
  });
});
