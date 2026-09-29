import type {
  PermissionKey,
  ProjectReleasePolicySummary,
  ReleaseDetail,
  ReleaseSummary,
  RoleKey,
} from '@ashniva/types';

import { jsonResponse, sessionUser } from '../../shared/testing/harness';

/**
 * Records and a fake API for the release and release-note tests. Imported only by `*.test.tsx`
 * files, so none of it reaches the app bundle.
 */

export function releaseSummary(over: Partial<ReleaseSummary> = {}): ReleaseSummary {
  return {
    id: 'r1',
    projectId: 'p1',
    projectName: 'Acme portal',
    version: '2026.09.1',
    title: 'September release',
    status: 'DRAFT',
    environment: 'PRODUCTION',
    itemCount: 1,
    scheduledFor: null,
    publishedAt: null,
    verifiedAt: null,
    createdAt: '2026-09-20T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
    ...over,
  };
}

export function releaseDetail(over: Partial<ReleaseDetail> = {}): ReleaseDetail {
  return {
    ...releaseSummary(),
    notes: 'Deploy after 18:00 and watch the payment logs.',
    publishedByName: null,
    rolledBackAt: null,
    rollbackReason: null,
    failureReason: null,
    releaseNoteId: null,
    items: [
      {
        id: 'ri1',
        kind: 'TASK',
        taskId: 't1',
        ticketId: null,
        changeRequestId: null,
        reference: 'ACM-142',
        title: 'Checkout button',
        position: 0,
      },
    ],
    approvals: [],
    history: [],
    readiness: {
      publishable: true,
      requiresTypedConfirmation: false,
      gates: [{ key: 'items', satisfied: true, reason: 'One item is going out' }],
    },
    ...over,
  };
}

export function releasePolicy(
  over: Partial<ProjectReleasePolicySummary> = {},
): ProjectReleasePolicySummary {
  return {
    projectId: 'p1',
    approverRoles: ['PROJECT_MANAGER'],
    requiresQaPass: true,
    requiresClientUat: false,
    requiresLiveVerification: true,
    requiresTypedConfirmation: false,
    ...over,
  };
}

export const paged = <T>(items: T[]) => ({ items, nextCursor: null, total: items.length });

/**
 * A fetch double answering by method and path. A key is either `/path` (any method) or
 * `POST /path`; the first key the request matches wins, so list the more specific first. Anything
 * unrouted answers with an empty page.
 */
export function fakeApi(routes: Record<string, unknown>) {
  return (input: unknown, init?: RequestInit) => {
    const url = String(input).split('?')[0] ?? '';
    const method = init?.method ?? 'GET';
    const match = Object.keys(routes).find((key) => {
      const [verb, path] = key.includes(' ') ? key.split(' ') : [null, key];
      return (verb === null || verb === method) && path !== undefined && url.endsWith(path);
    });
    return Promise.resolve(jsonResponse(match ? routes[match] : paged([])));
  };
}

/** The body of the first request sent with this method to a path ending in `suffix`. */
export function sent(fetchMock: jest.Mock, method: string, suffix: string): unknown {
  const call = fetchMock.mock.calls.find(
    ([input, init]: [unknown, RequestInit | undefined]) =>
      (init?.method ?? 'GET') === method && String(input).split('?')[0]?.endsWith(suffix),
  ) as [unknown, RequestInit | undefined] | undefined;
  if (!call) {
    return null;
  }
  const body = call[1]?.body;
  return typeof body === 'string' ? (JSON.parse(body) as unknown) : {};
}

export function signedIn(roleKey: RoleKey, permissions: PermissionKey[]) {
  return { status: 'signed-in' as const, user: sessionUser({ roleKey, permissions }) };
}
