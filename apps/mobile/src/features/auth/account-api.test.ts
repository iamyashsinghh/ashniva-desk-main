import { REFRESH_TOKEN_COOKIE } from '@ashniva/types';
import * as SecureStore from 'expo-secure-store';

import { SECURE_KEYS } from '../../shared/storage/secure-store';
import {
  acceptInvitation,
  changePassword,
  requestPasswordReset,
  switchOrganization,
} from './account-api';
import { clearSession, getAccessToken, resetSessionForTests, setSession } from './session-store';

/**
 * The account calls that answer with a session must commit it the way sign-in does — access token
 * in memory, rotated refresh token in the Keychain — or the next refresh presents a spent token.
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
    text: async () => (body === null ? '' : JSON.stringify(body)),
    json: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

function sessionReply(accessToken: string, refreshToken: string, sessionUser = user) {
  return response(
    200,
    { accessToken, accessTokenExpiresInSeconds: 900, user: sessionUser },
    { 'set-cookie': `${REFRESH_TOKEN_COOKIE}=${refreshToken}; Path=/auth; HttpOnly` },
  );
}

const fetchMock = jest.fn();

function requestOf(call: number): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  mocked.__store.clear();
  resetSessionForTests();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('requestPasswordReset', () => {
  it('sends the address without a token and accepts the empty 202', async () => {
    fetchMock.mockResolvedValueOnce(response(202, null));

    await expect(requestPasswordReset('a@b.com')).resolves.toBeNull();
    const { url, init } = requestOf(0);
    expect(url).toContain('/auth/forgot-password');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@b.com' });
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('acceptInvitation', () => {
  it('signs the new person in and keeps the refresh token in the keychain', async () => {
    fetchMock.mockResolvedValueOnce(sessionReply('access-1', 'refresh-1'));

    await acceptInvitation({ token: 't'.repeat(24), name: 'A', password: 'a'.repeat(12) });

    expect(getAccessToken()).toBe('access-1');
    expect(mocked.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-1');
  });

  it('shows the API reason when the invitation is refused', async () => {
    fetchMock.mockResolvedValueOnce(
      response(400, { statusCode: 400, message: 'This invitation has expired' }),
    );

    await expect(
      acceptInvitation({ token: 't'.repeat(24), password: 'a'.repeat(12) }),
    ).rejects.toThrow('This invitation has expired');
    expect(getAccessToken()).toBeNull();
  });
});

describe('switchOrganization', () => {
  it('presents the bearer token and refresh cookie, then commits the new session', async () => {
    await setSession('access-old', user, 'refresh-old');
    const other = { ...user, organization: { ...user.organization, id: 'o2', name: 'Other' } };
    fetchMock.mockResolvedValueOnce(sessionReply('access-new', 'refresh-new', other));

    await expect(switchOrganization('o2')).resolves.toMatchObject({
      organization: { id: 'o2' },
    });

    const headers = requestOf(0).init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-old');
    expect(headers.Cookie).toBe(`${REFRESH_TOKEN_COOKIE}=refresh-old`);
    expect(getAccessToken()).toBe('access-new');
    expect(mocked.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-new');
  });

  it('refreshes an expired access token once and tries again', async () => {
    await setSession('access-expired', user, 'refresh-1');
    fetchMock
      .mockResolvedValueOnce(response(401, { statusCode: 401, message: 'Unauthorized' }))
      .mockResolvedValueOnce(sessionReply('access-2', 'refresh-2'))
      .mockResolvedValueOnce(sessionReply('access-3', 'refresh-3'));

    await switchOrganization('o2');

    expect(String(requestOf(1).url)).toContain('/auth/refresh');
    expect((requestOf(2).init.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-2',
    );
    expect(getAccessToken()).toBe('access-3');
  });

  it('does not revive a session signed out while the switch was in flight', async () => {
    await setSession('access-old', user, 'refresh-old');
    fetchMock.mockImplementationOnce(async () => {
      await clearSession();
      return sessionReply('access-new', 'refresh-new');
    });

    await expect(switchOrganization('o2')).rejects.toThrow();
    expect(getAccessToken()).toBeNull();
    expect(mocked.__store.get(SECURE_KEYS.refreshToken)).toBeUndefined();
  });
});

describe('changePassword', () => {
  it('signs this device back in with the new password in the same organization', async () => {
    await setSession('access-old', user, 'refresh-old');
    fetchMock
      .mockResolvedValueOnce(response(204, null))
      .mockResolvedValueOnce(sessionReply('access-new', 'refresh-new'));

    await expect(changePassword('old-password', 'new-password-1', user)).resolves.toBe(true);

    expect(JSON.parse(String(requestOf(0).init.body))).toEqual({
      currentPassword: 'old-password',
      newPassword: 'new-password-1',
    });
    expect(JSON.parse(String(requestOf(1).init.body))).toEqual({
      email: 'a@b.com',
      password: 'new-password-1',
      organizationId: 'o1',
    });
    expect(mocked.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-new');
  });

  it('reports a wrong current password and does not try to sign in', async () => {
    await setSession('access-old', user, 'refresh-old');
    const wrong = () =>
      response(401, { statusCode: 401, message: 'Current password is incorrect' });
    // The API answers a wrong current password with 401, so the client refreshes and retries once
    // before giving up — the retry is refused for the same reason.
    fetchMock
      .mockResolvedValueOnce(wrong())
      .mockResolvedValueOnce(sessionReply('access-2', 'refresh-2'))
      .mockResolvedValueOnce(wrong());

    await expect(changePassword('wrong', 'new-password-1', user)).rejects.toThrow(
      'Current password is incorrect',
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/login'))).toBe(false);
  });

  it('says so when this device could not sign back in', async () => {
    await setSession('access-old', user, 'refresh-old');
    fetchMock
      .mockResolvedValueOnce(response(204, null))
      .mockRejectedValueOnce(new Error('offline'));

    await expect(changePassword('old-password', 'new-password-1', user)).resolves.toBe(false);
  });
});
