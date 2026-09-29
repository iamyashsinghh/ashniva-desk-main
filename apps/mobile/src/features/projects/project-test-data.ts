import type { ProjectDetail, ProjectSummary } from '@ashniva/types';

import { jsonResponse } from '../../shared/testing/harness';

/**
 * Records and a fake API for the project screens' tests. Imported only by `*.test.tsx` files, so
 * none of it reaches the app bundle.
 */

export function projectSummary(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'p1',
    code: 'ACM',
    name: 'Acme portal',
    description: 'Rebuild of the customer portal',
    type: 'FIXED_PRICE',
    status: 'ACTIVE',
    health: 'AT_RISK',
    clientOrganization: { id: 'org-1', name: 'Acme Ltd', slug: 'acme' },
    manager: { id: 'pm-1', name: 'Priya Manager', email: 'priya@example.com' },
    lead: { id: 'lead-1', name: 'Lee Lead', email: 'lee@example.com' },
    team: { id: 'team-1', name: 'Web team' },
    startDate: '2026-09-01',
    targetDate: '2026-12-15',
    requiresClientUat: true,
    progressPercent: 40,
    taskCounts: {
      total: 10,
      open: 5,
      inProgress: 2,
      inReview: 1,
      blocked: 1,
      completed: 4,
      overdue: 2,
    },
    openTicketCount: 3,
    memberCount: 2,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-20T09:00:00.000Z',
    ...over,
  };
}

export function projectDetail(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    ...projectSummary(),
    members: [
      {
        id: 'dev-1',
        name: 'Asha Dev',
        email: 'asha@example.com',
        role: 'DEVELOPER',
        responsibilities: ['API'],
      },
      {
        id: 'qa-1',
        name: 'Quinn Tester',
        email: 'quinn@example.com',
        role: 'TESTER',
        responsibilities: [],
      },
    ],
    ...over,
  };
}

/**
 * A fetch double answering by path. The first route whose key the URL contains wins, so list the
 * more specific paths first. Anything unrouted answers with an empty list.
 */
export function routeByPath(routes: Record<string, unknown>) {
  return (input: unknown) => {
    const url = String(input);
    const match = Object.keys(routes).find((path) => url.includes(path));
    return Promise.resolve(jsonResponse(match ? routes[match] : []));
  };
}
