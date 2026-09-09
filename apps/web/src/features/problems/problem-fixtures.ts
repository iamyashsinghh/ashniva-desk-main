import {
  EMERGENCY_FIX_STATUS,
  INCIDENT_STATUS,
  PRIORITY,
  PROBLEM_STATUS,
  PROBLEM_TICKET_RELATION,
  SIMILARITY_DECISION,
  type IncidentDetail,
  type ProblemClosureState,
  type ProblemDetail,
  type SimilarTicketSuggestion,
  type SimilarTicketsResponse,
} from '@ashniva/types';

/**
 * A problem and a suggestion set as the API returns them, for the tests in this folder.
 *
 * The closure block is spelled out rather than derived: these tests exist to prove the screen
 * obeys whatever the server sent, so a fixture that worked `allowed` out for itself would be
 * testing the wrong thing.
 */
export function closureFixture(over: Partial<ProblemClosureState> = {}): ProblemClosureState {
  return { allowed: true, blockers: [], warnings: [], ...over };
}

export function problemFixture(over: Partial<ProblemDetail> = {}): ProblemDetail {
  return {
    id: 'problem-1',
    key: 'PRB-7',
    number: 7,
    title: 'Invoice printing times out',
    status: PROBLEM_STATUS.FIX_ASSIGNED,
    severity: PRIORITY.HIGH,
    product: null,
    project: { id: 'project-acm', code: 'ACM', name: 'Acme Retail POS' },
    module: 'Billing',
    versions: ['3.1.4'],
    clientCount: 3,
    ticketCount: 4,
    owner: { id: 'user-priya', name: 'Priya S' },
    thresholdHitAt: '2026-09-05T08:00:00.000Z',
    hasRca: true,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T08:00:00.000Z',
    description: 'Three clients on 3.1.4 cannot print an invoice while the batch job runs.',
    tickets: [
      {
        ticketId: 'ticket-1',
        key: 'T-18',
        title: 'Invoice printing fails',
        status: 'IN_PROGRESS',
        relation: PROBLEM_TICKET_RELATION.DUPLICATE,
        clientOrganizationId: 'org-acme',
        clientOrganizationName: 'Acme Retail Pvt Ltd',
        productVersion: '3.1.4',
        linkedAt: '2026-09-02T08:00:00.000Z',
      },
    ],
    questions: [],
    rca: null,
    actions: [],
    fixTask: null,
    preventiveTestTask: null,
    preventiveTest: null,
    incidents: [],
    closure: closureFixture(),
    rcaDueDate: null,
    createdBy: { id: 'user-sneha', name: 'Sneha N' },
    ...over,
  };
}

export function suggestionFixture(
  over: Partial<SimilarTicketSuggestion> = {},
): SimilarTicketSuggestion {
  return {
    ticketId: 'ticket-2',
    key: 'T-24',
    title: 'Cannot print invoices',
    status: 'NEW',
    module: 'Billing',
    productVersion: '3.1.4',
    clientOrganizationId: 'org-zenith',
    clientOrganizationName: 'Zenith Logistics Ltd',
    score: 6,
    signals: ['error code ERR_PRN_TIMEOUT', 'module Billing', 'version 3.1.4'],
    decision: SIMILARITY_DECISION.PENDING,
    problemId: null,
    createdAt: '2026-09-03T08:00:00.000Z',
    ...over,
  };
}

export function similarFixture(over: Partial<SimilarTicketsResponse> = {}): SimilarTicketsResponse {
  return {
    suggestions: [suggestionFixture()],
    clientCount: 3,
    duplicateThreshold: 3,
    thresholdReached: true,
    problemId: null,
    ...over,
  };
}

/** An incident detail as the API returns it, for the incident screen's tests. */
export function incidentFixture(over: Partial<IncidentDetail> = {}): IncidentDetail {
  return {
    id: 'incident-1',
    key: 'INC-4',
    number: 4,
    title: 'Card payments failing at the counter',
    status: INCIDENT_STATUS.OPEN,
    severity: PRIORITY.CRITICAL,
    impact: 'Every store on 3.1.4',
    owner: { id: 'user-priya', name: 'Priya S' },
    project: { id: 'project-acm', code: 'ACM', name: 'Acme Retail POS' },
    product: null,
    problemId: null,
    emergencyFixStatus: EMERGENCY_FIX_STATUS.NONE,
    startedAt: '2026-09-06T08:00:00.000Z',
    detectedAt: '2026-09-06T08:05:00.000Z',
    resolvedAt: null,
    closedAt: null,
    durationMinutes: 42,
    createdAt: '2026-09-06T08:05:00.000Z',
    description: 'Card terminals return a timeout on every sale.',
    internalNotes: null,
    clientSummary: null,
    clientSummaryPublishedAt: null,
    emergencyFixReason: null,
    emergencyFixRequestedBy: null,
    emergencyFixDecidedBy: null,
    emergencyFixDecidedAt: null,
    timeline: [],
    links: [],
    resolution: null,
    ...over,
  };
}
