import { REFRESH_TOKEN_COOKIE } from '@ashniva/types';

import {
  clearSession,
  getAccessToken,
  resetSessionForTests,
  setSession,
} from '../../features/auth/session-store';
import { SECURE_KEYS, readSecure } from '../storage/secure-store';
import { ApiError, NetworkError, apiRequest, buildQuery, errorMessage, isOffline } from './client';

/**
 * The API client.
 *
 * `fetch` is replaced so the tests are about the client's behaviour rather than a server's: which
 * headers it sends, what it does with a 401, and what it turns a failure into.
 */

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

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
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
  resetSessionForTests();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('buildQuery', () => {
  it('encodes what is present and drops what is not', () => {
    expect(buildQuery({ limit: 20, search: 'a b', cursor: undefined, empty: '' })).toBe(
      '?limit=20&search=a%20b',
    );
  });

  it('is empty when there is nothing to send', () => {
    expect(buildQuery(undefined)).toBe('');
    expect(buildQuery({})).toBe('');
  });
});

describe('requests', () => {
  it('attaches the bearer token', async () => {
    await setSession('access-1', user, 'refresh-1');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiRequest('/tasks');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('sends no token when there is no session', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await apiRequest('/health');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('never puts an organization id in the URL', async () => {
    // Tenant scope comes from the token. A URL the app builds cannot ask for another tenant.
    await setSession('access-1', user, 'refresh-1');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await apiRequest('/tasks', { query: { limit: 20 } });

    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('o1');
  });

  it('returns undefined for a 204 rather than trying to parse nothing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: async () => '',
      headers: { get: () => null },
    } as unknown as Response);

    await expect(
      apiRequest('/notifications/read-all', { method: 'POST' }),
    ).resolves.toBeUndefined();
  });
});

describe('errors', () => {
  it('carries the API message, not a generic one', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        statusCode: 409,
        error: 'Conflict',
        message: 'This task is already in review',
        timestamp: '2026-09-06T10:00:00.000Z',
      }),
    );

    await expect(apiRequest('/tasks/x/submit', { method: 'POST' })).rejects.toThrow(
      'This task is already in review',
    );
  });

  it('turns an unreachable server into a NetworkError', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));

    const failure = await apiRequest('/tasks').catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(NetworkError);
    expect(isOffline(failure)).toBe(true);
  });

  it('says a timeout was a timeout', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    await expect(apiRequest('/tasks')).rejects.toThrow('took too long');
  });

  it('does not treat a refused request as being offline', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { statusCode: 403, message: 'Not allowed' }));

    const failure = await apiRequest('/tasks').catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ApiError);
    expect(isOffline(failure)).toBe(false);
  });

  it('uses a message from a body that is not the full standard shape', async () => {
    // A proxy's error page or an older deployment can send `{ message }` and nothing else. That
    // sentence is still worth showing; "Request failed (502)" never is.
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { message: 'Upstream is restarting' }));

    await expect(apiRequest('/tasks')).rejects.toThrow('Upstream is restarting');
  });

  it('falls back when the body carries no message at all', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { oops: true }));
    await expect(apiRequest('/tasks')).rejects.toThrow('Request failed (500)');
  });

  it('gives a readable message for anything thrown', () => {
    expect(errorMessage(new ApiError(400, { message: 'Bad' }, 'fallback'))).toBe('Bad');
    expect(errorMessage(new ApiError(400, null, 'fallback'))).toBe('fallback');
    expect(errorMessage(new NetworkError())).toBe('Could not reach the server');
    expect(errorMessage('a string')).toBe('Something went wrong');
  });
});

describe('the refresh flow', () => {
  it('refreshes once on a 401 and repeats the request', async () => {
    await setSession('stale-token', user, 'refresh-1');

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: 'Expired' }))
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          { accessToken: 'fresh-token', user },
          { 'set-cookie': `${REFRESH_TOKEN_COOKIE}=refresh-2; Path=/auth; HttpOnly` },
        ),
      )
      .mockResolvedValueOnce(jsonResponse(200, { id: 't1' }));

    await expect(apiRequest<{ id: string }>('/tasks/t1')).resolves.toEqual({ id: 't1' });
    expect(getAccessToken()).toBe('fresh-token');

    // The retried request carries the new token, not the stale one.
    const retry = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect((retry.headers as Record<string, string>).Authorization).toBe('Bearer fresh-token');
  });

  it('presents the stored refresh token as a Cookie header', async () => {
    await setSession('stale-token', user, 'refresh-1');

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: 'Expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'fresh', user }))
      .mockResolvedValueOnce(jsonResponse(200, {}));

    await apiRequest('/tasks');

    const refresh = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((refresh.headers as Record<string, string>).Cookie).toBe(
      `${REFRESH_TOKEN_COOKIE}=refresh-1`,
    );
  });

  it('signs out when the refresh is refused', async () => {
    await setSession('stale-token', user, 'refresh-1');

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: 'Expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: 'Revoked' }));

    await expect(apiRequest('/tasks')).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBeNull();
  });

  it('does not try to refresh when there is no stored token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: 'No session' }));

    await expect(apiRequest('/tasks')).rejects.toBeInstanceOf(ApiError);
    // One call: the request. No refresh was attempted with nothing to present.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh between concurrent 401s', async () => {
    // Two refreshes would present the same token twice, and the API treats a reused refresh
    // token as theft — it revokes the whole family.
    await setSession('stale-token', user, 'refresh-1');

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) {
        return jsonResponse(200, { accessToken: 'fresh', user });
      }
      return getAccessToken() === 'fresh'
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { statusCode: 401, message: 'Expired' });
    });

    await Promise.all([apiRequest('/tasks'), apiRequest('/tickets'), apiRequest('/notifications')]);

    const refreshCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it('does not refresh for a request that opted out', async () => {
    await setSession('stale', user, 'refresh-1');
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: 'No' }));

    await expect(
      apiRequest('/auth/login', { method: 'POST', skipAuth: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing behind after signing out', async () => {
    await setSession('access', user, 'refresh');
    await clearSession();
    expect(getAccessToken()).toBeNull();
  });

  it('does not let a refresh that lands after sign-out bring the session back', async () => {
    // The refresh reads the stored token, awaits the network, then commits. Signing out during
    // that await used to be undone by the commit — a live session back in memory and a fresh
    // refresh token written into the Keychain the sign-out had just emptied, so the next cold
    // start signed the previous person straight back in on a shared phone.
    await setSession('stale', user, 'refresh-1');

    let releaseRefresh: (value: Response) => void = () => undefined;
    const pendingRefresh = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: 'Expired' }))
      .mockReturnValueOnce(pendingRefresh);

    const inFlight = apiRequest('/tasks').catch(() => 'rejected');

    // The sign-out happens while the refresh is still on the wire.
    await clearSession();
    releaseRefresh(
      jsonResponse(
        200,
        { accessToken: 'brand-new', accessTokenExpiresInSeconds: 900, user },
        { 'set-cookie': `${REFRESH_TOKEN_COOKIE}=refresh-2; Path=/; HttpOnly` },
      ),
    );
    await inFlight;

    expect(getAccessToken()).toBeNull();
    expect(await readSecure(SECURE_KEYS.refreshToken)).toBeNull();
  });
});
