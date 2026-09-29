import type { DirectoryEntry, TaskSummary } from '@ashniva/types';

import { jsonResponse } from '../../shared/testing/harness';

/** Records and a fake API for the intern-work tests. Imported only by `*.test.tsx` files. */

export function internTask(over: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: 'task-1',
    key: 'LRN-3',
    title: 'Build a todo app',
    number: 3,
    status: 'ASSIGNED',
    priority: 'MEDIUM',
    project: { id: 'p1', code: 'LRN', name: 'Learning' },
    clientOrganization: null,
    category: null,
    module: null,
    isInternTask: true,
    assignedTo: { id: 'intern-1', name: 'Ivy Intern', email: 'ivy@example.com' },
    createdBy: { id: 'lead-1', name: 'Lee Lead', email: 'lee@example.com' },
    reviewer: null,
    tester: null,
    dueDate: '2026-09-30',
    scheduledStartAt: null,
    dueAt: null,
    workAreas: [],
    isUpcoming: false,
    timing: {
      status: 'UNSCHEDULED',
      delayMinutes: null,
      minutesUntilDue: null,
      estimateMinutes: null,
      loggedMinutes: 0,
      overrunMinutes: null,
    },
    estimateMinutes: null,
    loggedMinutes: 0,
    clientVisible: false,
    isOverdue: false,
    ticket: null,
    startedAt: null,
    submittedAt: null,
    completedAt: null,
    createdAt: '2026-09-28T09:00:00.000Z',
    updatedAt: '2026-09-28T09:00:00.000Z',
    milestone: null,
    changeRequest: null,
    ...over,
  };
}

export const DIRECTORY: DirectoryEntry[] = [
  {
    id: 'intern-1',
    name: 'Ivy Intern',
    email: 'ivy@example.com',
    roleKey: 'INTERN',
    title: null,
    teams: [],
  },
  {
    id: 'dev-1',
    name: 'Asha Dev',
    email: 'asha@example.com',
    roleKey: 'DEVELOPER',
    title: null,
    teams: [],
  },
];

/**
 * A fetch double answering by path and method. The first route whose key the URL contains wins;
 * a key may start with the method ("POST /tasks") to answer only that verb.
 */
export function routeRequests(routes: Record<string, unknown>) {
  return (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const match = Object.keys(routes).find((key) => {
      const [verb, path] = key.includes(' ') ? key.split(' ') : ['GET', key];
      return verb === method && url.includes(path ?? '');
    });
    return Promise.resolve(jsonResponse(match ? routes[match] : []));
  };
}
