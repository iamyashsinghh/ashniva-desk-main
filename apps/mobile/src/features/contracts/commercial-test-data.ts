import type {
  ChangeRequestDetail,
  ChangeRequestSummary,
  ContractDetail,
  ContractSummary,
  MilestoneDetail,
} from '@ashniva/types';

import { jsonResponse } from '../../shared/testing/harness';

/** Fixtures and a fetch router for the contract, change-request and milestone screen tests. */

export const CLIENT = { id: 'org-client', name: 'Acme Retail', slug: 'acme' };
export const PROJECT = { id: 'proj-1', code: 'ACME', name: 'Acme storefront' };
const PERSON = { id: 'user-1', name: 'Priya Rao', email: 'priya@example.com' };

export function contractSummary(overrides: Partial<ContractSummary> = {}): ContractSummary {
  return {
    id: 'ct-1',
    number: 'CT-2026-0007',
    title: 'Managed support 2026',
    type: 'SUPPORT_HOURS',
    status: 'ACTIVE',
    clientOrganization: CLIENT,
    project: PROJECT,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    renewalDate: null,
    isExpiringSoon: false,
    currency: 'INR',
    contractValue: '120000.00',
    tracksHours: true,
    hours: {
      includedMinutes: 600,
      purchasedMinutes: 0,
      carriedForwardMinutes: 0,
      consumedMinutes: 240,
      reservedMinutes: 0,
      adjustmentMinutes: 0,
      expiredMinutes: 0,
      remainingMinutes: 360,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      isLow: false,
    },
    openChangeRequestCount: 1,
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-09-20T09:00:00.000Z',
    ...overrides,
  };
}

export function contractDetail(overrides: Partial<ContractDetail> = {}): ContractDetail {
  return {
    ...contractSummary(),
    description: null,
    scope: 'Break-fix support for the storefront.',
    internalNotes: 'Renewal price rises 8%',
    internalCost: '80000.00',
    clientNotes: null,
    includedMinutesPerPeriod: 600,
    billingPeriod: 'MONTHLY',
    carryForwardRule: 'NONE',
    carryForwardCapMinutes: null,
    lowHoursThresholdMinutes: 120,
    autoRenew: false,
    renewalNoticeDays: 30,
    milestones: [],
    paymentMilestones: [],
    documents: [],
    recentLedger: [],
    createdBy: PERSON,
    archivedAt: null,
    ...overrides,
  };
}

export function changeRequestSummary(
  overrides: Partial<ChangeRequestSummary> = {},
): ChangeRequestSummary {
  return {
    id: 'cr-1',
    number: 'CR-0012',
    title: 'Add gift wrapping at checkout',
    status: 'INTERNAL_REVIEW',
    clientOrganization: CLIENT,
    project: PROJECT,
    contract: null,
    requestedBy: PERSON,
    estimatedMinutes: null,
    costImpact: null,
    currency: 'INR',
    timelineImpactDays: null,
    scheduledFor: null,
    submittedAt: '2026-09-20T09:00:00.000Z',
    linkedTaskCount: 0,
    createdAt: '2026-09-19T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
    ...overrides,
  };
}

export function changeRequestDetail(
  overrides: Partial<ChangeRequestDetail> = {},
): ChangeRequestDetail {
  return {
    ...changeRequestSummary(),
    description: 'Shoppers want a gift-wrap option on the checkout page.',
    businessReason: 'Festive season',
    scope: null,
    impact: null,
    internalNotes: null,
    decisionNote: null,
    approvedAt: null,
    completedAt: null,
    comments: [],
    files: [],
    linkedTasks: [],
    milestones: [],
    history: [],
    actions: [],
    createdBy: PERSON,
    ...overrides,
  };
}

export function milestoneDetail(overrides: Partial<MilestoneDetail> = {}): MilestoneDetail {
  return {
    id: 'ms-1',
    name: 'Checkout redesign',
    description: null,
    project: PROJECT,
    contract: null,
    owner: PERSON,
    startDate: '2026-09-01',
    dueDate: '2026-10-15',
    status: 'IN_PROGRESS',
    progressPercent: 40,
    progressMode: 'AUTO',
    clientVisible: true,
    requiresApproval: false,
    approvalStatus: null,
    isOverdue: false,
    deliverableCount: 1,
    deliverablesDone: 0,
    linkedTaskCount: 0,
    linkedTasksCompleted: 0,
    completedAt: null,
    sortOrder: 0,
    deliverables: [
      {
        id: 'dl-1',
        title: 'Wireframes',
        description: null,
        isDone: false,
        doneAt: null,
        sortOrder: 0,
      },
    ],
    dependsOn: [],
    dependents: [],
    linkedTasks: [],
    history: [],
    changeRequest: null,
    createdBy: PERSON,
    createdAt: '2026-08-20T09:00:00.000Z',
    updatedAt: '2026-09-20T09:00:00.000Z',
    ...overrides,
  };
}

/** Answers "METHOD /path-suffix" routes; anything else is a 404 the screen has to survive. */
export function routeFetch(fetchMock: jest.Mock, routes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path =
      String(url)
        .replace(/^https?:\/\/[^/]+/, '')
        .split('?')[0] ?? '';
    for (const [key, body] of Object.entries(routes)) {
      const [routeMethod, routePath] = key.split(' ');
      if (routeMethod === method && routePath && path.endsWith(routePath)) {
        return jsonResponse(body);
      }
    }
    return jsonResponse({ message: `No route for ${method} ${path}` }, 404);
  });
}

/** The first request to a path ending in `suffix` with `method`, or null. */
export function sentRequest(
  fetchMock: jest.Mock,
  suffix: string,
  method: string,
): { url: string; body: unknown; headers: Record<string, string> } | null {
  const call = fetchMock.mock.calls.find(
    ([url, init]) =>
      String(url).split('?')[0]?.endsWith(suffix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  );
  if (!call) {
    return null;
  }
  const init = (call[1] ?? {}) as RequestInit;
  return {
    url: String(call[0]),
    body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    headers: (init.headers ?? {}) as Record<string, string>,
  };
}
