import type { PermissionKey, RoleKey, SessionUser } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '../../features/auth/SessionProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

/**
 * What a screen needs above it to render at all, in one place.
 *
 * Written once because every screen test needs the same four providers in the same order, and a
 * suite that forgets one fails with a context error that says nothing about the screen.
 *
 * The session is the real `SessionProvider` rather than a stub of the context: what a screen is
 * given has to be what the app gives it, or a test proves something about a double. A test file
 * mocks `auth-api`'s `restoreSession` to hand it the user it wants — see `signedInAs`.
 *
 * Imported only by tests. It is not reachable from `App.tsx`, so nothing here ends up in a bundle.
 */

/**
 * A client that keeps nothing after the screen goes away.
 *
 * `gcTime: 0` is not tidiness. React Query holds a finished query or mutation for its
 * garbage-collection window — five minutes by default — and schedules a real timer to drop it. A
 * jest worker with one of those outstanding does not exit, and the run ends in "a worker process
 * has failed to exit gracefully" instead of finishing.
 */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
}

export function renderScreen(ui: ReactNode): Promise<RenderResult> {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={testQueryClient()}>
          <SessionProvider>{ui}</SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

/** A signed-in person, for a suite that has mocked `restoreSession` to return one. */
export function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'sam@example.com',
    name: 'Sam Patel',
    title: null,
    roleKey: 'DEVELOPER' as RoleKey,
    roleId: 'role-1',
    roleName: 'Developer',
    isCustomRole: false,
    permissions: [] as PermissionKey[],
    showDevelopmentSection: true,
    organization: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Ashniva',
      slug: 'ashniva',
      isServiceProvider: true,
    },
    organizations: [],
    ...overrides,
  };
}

/** One JSON response, shaped the way the API client reads one. */
export function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

/** The paths a fetch double was asked for, in order. Handy for "it sent nothing" assertions. */
export function requestedPaths(fetchMock: jest.Mock): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}
