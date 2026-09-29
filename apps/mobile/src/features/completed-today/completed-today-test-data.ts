import type { ClientUpdateSummary } from '@ashniva/types';

import { jsonResponse } from '../../shared/testing/harness';

/** Records and a fake API for the Completed Today tests. Imported only by test files. */

export function clientUpdate(over: Partial<ClientUpdateSummary> = {}): ClientUpdateSummary {
  return {
    id: 'u1',
    title: 'Checkout accepts cards',
    body: 'You can now pay by card at checkout.',
    status: 'PENDING',
    workDate: '2026-09-28',
    project: { id: 'p1', code: 'ACM', name: 'Acme portal' },
    clientOrganization: { id: 'org-1', name: 'Acme Ltd', slug: 'acme' },
    task: { id: 'task-1', key: 'ACM-12', title: 'Card payments' },
    ticket: null,
    author: { id: 'dev-1', name: 'Asha Dev', email: 'asha@example.com' },
    publishedBy: null,
    publishedAt: null,
    createdAt: '2026-09-28T09:00:00.000Z',
    ...over,
  };
}

/**
 * A fetch double for `/client-updates`: the pending and published lists by their `status`
 * parameter, and every write answered with the update it was about.
 */
export function clientUpdatesApi(pending: ClientUpdateSummary[], published: ClientUpdateSummary[]) {
  return (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    if (init?.method && init.method !== 'GET') {
      return Promise.resolve(jsonResponse(pending[0] ?? published[0] ?? {}));
    }
    if (url.includes('/organizations/options')) {
      return Promise.resolve(
        jsonResponse([
          { id: 'ours', name: 'Ashniva', isServiceProvider: true },
          { id: 'org-1', name: 'Acme Ltd', isServiceProvider: false },
        ]),
      );
    }
    if (url.includes('status=PENDING')) {
      return Promise.resolve(jsonResponse(pending));
    }
    if (url.includes('status=PUBLISHED')) {
      return Promise.resolve(jsonResponse(published));
    }
    return Promise.resolve(jsonResponse([]));
  };
}
