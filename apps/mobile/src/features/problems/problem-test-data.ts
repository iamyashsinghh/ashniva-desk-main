import {
  EMERGENCY_FIX_STATUS,
  INCIDENT_STATUS,
  PRIORITY,
  PROBLEM_STATUS,
  PROBLEM_TICKET_RELATION,
  type IncidentDetail,
  type ProblemDetail,
  type ProblemSummary,
} from '@ashniva/types';

import { jsonResponse } from '../../shared/testing/harness';

/** Fixtures for the problem and incident screen tests. Test-only. */

const AT = '2026-09-20T09:00:00.000Z';

export function problemSummary(overrides: Partial<ProblemSummary> = {}): ProblemSummary {
  return {
    id: 'p1',
    key: 'PRB-12',
    number: 12,
    title: 'Checkout times out on large carts',
    status: PROBLEM_STATUS.OPEN,
    severity: PRIORITY.HIGH,
    product: { id: 'pr1', code: 'SHOP', name: 'Shopfront' },
    project: { id: 'j1', code: 'NW', name: 'Northwind portal' },
    module: 'Checkout',
    versions: ['3.2.0'],
    clientCount: 3,
    ticketCount: 4,
    owner: null,
    thresholdHitAt: AT,
    hasRca: false,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function problemDetail(overrides: Partial<ProblemDetail> = {}): ProblemDetail {
  return {
    ...problemSummary(),
    description: 'Carts over forty lines hit the gateway timeout.',
    tickets: [
      {
        ticketId: 't1',
        key: 'AD-127',
        title: 'Cannot pay for a big order',
        status: 'OPEN',
        relation: PROBLEM_TICKET_RELATION.DUPLICATE,
        clientOrganizationId: 'c1',
        clientOrganizationName: 'Northwind',
        productVersion: '3.2.0',
        linkedAt: AT,
      },
    ],
    questions: [],
    rca: null,
    actions: [],
    fixTask: null,
    preventiveTestTask: null,
    preventiveTest: null,
    incidents: [],
    closure: {
      allowed: false,
      blockers: ['The root-cause analysis has not been approved.'],
      warnings: [],
    },
    rcaDueDate: null,
    createdBy: { id: 'u1', name: 'Priya Rao' },
    ...overrides,
  };
}

export function incidentDetail(overrides: Partial<IncidentDetail> = {}): IncidentDetail {
  return {
    id: 'i1',
    key: 'INC-4',
    number: 4,
    title: 'Payments failing for every client',
    status: INCIDENT_STATUS.OPEN,
    severity: PRIORITY.CRITICAL,
    impact: 'No client can take a card payment.',
    owner: null,
    project: { id: 'j1', code: 'NW', name: 'Northwind portal' },
    product: null,
    problemId: null,
    emergencyFixStatus: EMERGENCY_FIX_STATUS.NONE,
    startedAt: AT,
    detectedAt: AT,
    resolvedAt: null,
    closedAt: null,
    durationMinutes: 95,
    createdAt: AT,
    description: 'The payment gateway answers 502 to every charge.',
    internalNotes: null,
    clientSummary: null,
    clientSummaryPublishedAt: null,
    emergencyFixReason: null,
    emergencyFixRequestedBy: null,
    emergencyFixDecidedBy: null,
    emergencyFixDecidedAt: null,
    timeline: [{ id: 'e1', kind: 'OPENED', body: 'Incident opened', actor: null, occurredAt: AT }],
    links: [],
    resolution: null,
    ...overrides,
  };
}

/**
 * Answers each request with the first route whose path the URL contains; the rest get `[]`.
 * A key may start with a method (`'POST /problems'`) to answer only that method.
 */
export function routeByPath(routes: Record<string, unknown>) {
  return (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const match = Object.keys(routes).find((key) => {
      const [first, second] = key.split(' ');
      return second ? first === method && url.includes(second) : url.includes(key);
    });
    return Promise.resolve(jsonResponse(match ? routes[match] : []));
  };
}

/** The JSON body of the first request to a URL ending in `suffix` with `method`, or null. */
export function sentBody(fetchMock: jest.Mock, suffix: string, method: string): unknown {
  const call = fetchMock.mock.calls.find(
    ([url, init]) =>
      new URL(String(url), 'http://test').pathname.endsWith(suffix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  );
  if (!call) {
    return null;
  }
  const body = (call[1] as RequestInit).body;
  return typeof body === 'string' ? JSON.parse(body) : {};
}
