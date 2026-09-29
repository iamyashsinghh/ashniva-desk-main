import { ROLE_KEYS, type PermissionKey } from '@ashniva/types';

import { jsonResponse, sessionUser } from '../../../shared/testing/harness';

/**
 * Fetch and session helpers for the settings screen tests. Imported only by tests.
 *
 * Each test file still mocks `../auth/auth-api` itself — `jest.mock` is hoisted per file — and
 * `signInWith` reaches that mock through `jest.requireMock`.
 */

export function signInWith(permissions: PermissionKey[]) {
  const { restoreSession } = jest.requireMock('../../auth/auth-api') as {
    restoreSession: jest.Mock;
  };
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey: ROLE_KEYS.SUPER_ADMIN, permissions }),
  });
}

type Answer = unknown | ((body: unknown) => unknown);

/**
 * Answers requests by `"METHOD /path"`, matched on the path without its query string. A request
 * nothing answers gets a 404, so a screen asking for something unexpected fails loudly.
 */
export function apiRoutes(routes: Record<string, Answer>) {
  return (input: unknown, init?: RequestInit) => {
    const url = String(input).split('?')[0] ?? '';
    const method = init?.method ?? 'GET';
    const key = Object.keys(routes).find((candidate) => {
      const [verb, path] = candidate.split(' ');
      return verb === method && path !== undefined && url.endsWith(path);
    });
    if (!key) {
      return Promise.resolve(jsonResponse({ message: `No route for ${method} ${url}` }, 404));
    }
    const answer = routes[key];
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    return Promise.resolve(
      jsonResponse(
        typeof answer === 'function' ? (answer as (b: unknown) => unknown)(body) : answer,
      ),
    );
  };
}

/** The JSON body of the first `method path` request, or undefined when none was sent. */
export function sentBody(fetchMock: jest.Mock, method: string, path: string): unknown {
  const call = fetchMock.mock.calls.find(
    ([input, init]: [unknown, RequestInit | undefined]) =>
      (init?.method ?? 'GET') === method && String(input).split('?')[0]?.endsWith(path),
  ) as [unknown, RequestInit | undefined] | undefined;
  const body = call?.[1]?.body;
  return typeof body === 'string' ? (JSON.parse(body) as unknown) : undefined;
}

/** Whether any `method path` request was sent. */
export function wasSent(fetchMock: jest.Mock, method: string, path: string): boolean {
  return fetchMock.mock.calls.some(
    ([input, init]: [unknown, RequestInit | undefined]) =>
      (init?.method ?? 'GET') === method && String(input).split('?')[0]?.endsWith(path),
  );
}
