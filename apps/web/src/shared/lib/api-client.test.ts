import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Staying signed in.
 *
 * The rule these tests hold: only the API refusing the refresh cookie ends a session. A dropped
 * connection, a rate limit or the dev proxy's 502 while the API restarts must never put somebody
 * on the sign-in form.
 */

const user = { id: 'u1', name: 'A' };

function reply(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Fresh modules per test: the session store is module state. */
async function load() {
  vi.resetModules();
  const client = await import('./api-client');
  const store = await import('../../features/auth/session-store');
  const auth = await import('../../features/auth/api');
  return { client, store, auth };
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('refreshSessionOutcome', () => {
  it('signs in with the rotated cookie', async () => {
    const { client, store } = await load();
    fetchMock.mockResolvedValueOnce(reply(200, { accessToken: 'fresh', user }));

    await expect(client.refreshSessionOutcome()).resolves.toBe('refreshed');
    expect(store.getAccessToken()).toBe('fresh');
  });

  it('ends the session only when the cookie is refused', async () => {
    const { client, store } = await load();
    fetchMock.mockResolvedValueOnce(reply(401, { message: 'Refresh token was already used' }));

    await expect(client.refreshSessionOutcome()).resolves.toBe('refused');
    expect(store.getSessionState().status).toBe('anonymous');
  });

  it.each([
    ['the network is down', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['the refresh is rate limited', async () => reply(429)],
    ['the API is restarting behind the dev proxy', async () => reply(502)],
  ])('keeps the page loading when %s', async (_case, answer) => {
    const { client, store } = await load();
    fetchMock.mockImplementationOnce(answer);

    await expect(client.refreshSessionOutcome()).resolves.toBe('unreachable');
    expect(store.getSessionState().status).toBe('loading');
  });

  it('shares one refresh between concurrent callers', async () => {
    const { client } = await load();
    fetchMock.mockResolvedValue(reply(200, { accessToken: 'fresh', user }));

    await Promise.all([client.refreshSession(), client.refreshSession(), client.refreshSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('restoreSession', () => {
  it('keeps trying while the API cannot be reached, then signs in', async () => {
    vi.useFakeTimers();
    const { auth, store } = await load();
    fetchMock
      .mockResolvedValueOnce(reply(502))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(reply(200, { accessToken: 'fresh', user }));

    const restored = auth.restoreSession();
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getSessionState().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(2000);

    await expect(restored).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(store.getSessionState().status).toBe('authenticated');
  });

  it('shows the sign-in form when there is no session to restore', async () => {
    const { auth, store } = await load();
    fetchMock.mockResolvedValueOnce(reply(401, { message: 'No refresh token' }));

    await expect(auth.restoreSession()).resolves.toBe(false);
    expect(store.getSessionState().status).toBe('anonymous');
  });
});
