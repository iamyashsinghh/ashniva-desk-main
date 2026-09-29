import type { DailyReportResponse, ReportResult } from '@ashniva/types';

import { jsonResponse } from '../../shared/testing/harness';

/**
 * Records and a fake API for the report and summary screens' tests. Imported only by test files,
 * so none of it reaches the app bundle.
 */

export function dailyReport(over: Partial<DailyReportResponse> = {}): DailyReportResponse {
  return {
    userId: 'u1',
    userName: 'Asha Dev',
    reportDate: '2026-09-28',
    generatedAt: '2026-09-28T13:00:00.000Z',
    snapshot: {
      minutesLogged: 150,
      tasksCompleted: 1,
      tasksSubmitted: 1,
      tasksWorkedOn: 2,
      items: [
        {
          taskId: 't1',
          taskKey: 'ACM-12',
          title: 'Checkout page',
          projectId: 'p1',
          projectName: 'Acme portal',
          status: 'COMPLETED',
          minutes: 90,
          summaries: ['Wired the payment form'],
          completedToday: true,
          submittedForReviewToday: false,
          clientVisible: true,
        },
      ],
    },
    ...over,
  };
}

export function projectProgressReport(over: Partial<ReportResult> = {}): ReportResult {
  return {
    type: 'project-progress',
    title: 'Project progress',
    generatedAt: '2026-09-28T10:00:00.000Z',
    filters: {},
    columns: [
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'name', label: 'Project', kind: 'text' },
      { key: 'status', label: 'Status', kind: 'status' },
      { key: 'tasks', label: 'Tasks', kind: 'number' },
      { key: 'progressPercent', label: 'Progress', kind: 'percent' },
    ],
    rows: [
      { code: 'ACM', name: 'Acme portal', status: 'ACTIVE', tasks: 10, progressPercent: 40 },
      { code: 'BLU', name: 'Blue app', status: 'ON_HOLD', tasks: 4, progressPercent: 75 },
    ],
    totals: [
      { label: 'Projects', value: 2 },
      { label: 'Overall progress', value: '50%' },
    ],
    ...over,
  };
}

/**
 * A fetch double answering by method and path. Keys are `"PATH"` (a GET) or `"METHOD PATH"`; the
 * first key whose path the URL contains wins, so list the more specific paths first. Anything
 * unrouted answers with an empty list.
 */
export function apiRoutes(routes: Record<string, unknown>) {
  return (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const match = Object.keys(routes).find((key) => {
      const [routeMethod, path] = key.includes(' ') ? key.split(' ') : ['GET', key];
      return routeMethod === method && path !== undefined && url.includes(path);
    });
    return Promise.resolve(jsonResponse(match ? routes[match] : []));
  };
}

/** The calls a fetch double received with a given method, as [url, parsed body]. */
export function callsWith(fetchMock: jest.Mock, method: string): [string, unknown][] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === method)
    .map(([url, init]) => {
      const body = (init as RequestInit).body;
      return [String(url), body ? JSON.parse(String(body)) : undefined];
    });
}
