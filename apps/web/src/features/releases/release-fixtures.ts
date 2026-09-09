import {
  RELEASE_STATUS,
  TEST_ENVIRONMENT,
  type ReleaseDetail,
  type ReleaseGate,
  type ReleaseReadiness,
} from '@ashniva/types';

/**
 * A release as the API returns it, for the tests in this folder.
 *
 * The readiness block is spelled out rather than derived: these tests exist to prove the screen
 * obeys whatever the server sent, so a fixture that computed `publishable` for itself would be
 * testing the wrong thing.
 */
export function readinessFixture(over: Partial<ReleaseReadiness> = {}): ReleaseReadiness {
  const gates: ReleaseGate[] = [
    { key: 'items', satisfied: true, reason: '2 items included' },
    { key: 'approvals', satisfied: true, reason: 'All 2 sign-offs given' },
    { key: 'qa', satisfied: true, reason: 'All 4 QA checks passed' },
    { key: 'uat', satisfied: true, reason: 'The client has signed off' },
    { key: 'publisher', satisfied: true, reason: 'You may publish releases' },
  ];
  return { publishable: true, requiresTypedConfirmation: true, gates, ...over };
}

export function releaseFixture(over: Partial<ReleaseDetail> = {}): ReleaseDetail {
  return {
    id: 'release-1',
    projectId: 'project-acm',
    projectName: 'Acme Retail POS',
    version: '2026.09.1',
    title: 'Counter printing fixes',
    status: RELEASE_STATUS.APPROVED,
    environment: TEST_ENVIRONMENT.PRODUCTION,
    itemCount: 2,
    scheduledFor: null,
    publishedAt: null,
    verifiedAt: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T08:00:00.000Z',
    notes: null,
    publishedByName: null,
    rolledBackAt: null,
    rollbackReason: null,
    failureReason: null,
    releaseNoteId: null,
    items: [
      {
        id: 'item-1',
        kind: 'TASK',
        taskId: 'task-1',
        ticketId: null,
        changeRequestId: null,
        reference: 'ACM-142',
        title: 'Printer settings screen',
        position: 0,
      },
    ],
    approvals: [],
    history: [],
    readiness: readinessFixture(),
    ...over,
  };
}
