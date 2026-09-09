import type {
  TestAccountSummary,
  TestingAssignmentDetail,
  TestingAssignmentSummary,
  TestResultRow,
} from '@ashniva/types';

import type { AssignmentDetailRow, AssignmentSummaryRow } from './qa.repository';
import { OPEN_TESTING_ASSIGNMENT_STATUSES } from './testing-assignment-workflow';

/**
 * Assignment responses, built field by field.
 *
 * Allow-lists rather than spreads, so a column added to `testing_assignments` later cannot appear
 * in a response because nobody remembered it was there.
 */

export function toAssignmentSummary(
  row: AssignmentSummaryRow,
  now = new Date(),
): TestingAssignmentSummary {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    environment: row.environment,
    projectId: row.projectId,
    projectName: row.project.name,
    subjectLabel: subjectLabel(row),
    taskId: row.taskId,
    ticketId: row.ticketId,
    releaseId: row.releaseId,
    assignedToUserId: row.assignedToUserId,
    assignedToName: row.assignedTo?.name ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    isOverdue: isOverdue(row, now),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAssignmentDetail(
  row: AssignmentDetailRow,
  options: { testAccount: TestAccountSummary | null; now?: Date },
): TestingAssignmentDetail {
  return {
    ...toAssignmentSummary(row, options.now),
    stagingUrl: row.stagingUrl,
    whatDeveloped: row.whatDeveloped,
    whatToTest: row.whatToTest,
    acceptanceCriteria: row.acceptanceCriteria,
    developerNotes: row.developerNotes,
    browserDevice: row.browserDevice,
    checksStatus: row.checksStatus,
    clarificationQuestion: row.clarificationQuestion,
    clarificationAnswer: row.clarificationAnswer,
    assignedByName: row.assignedBy.name,
    // Which login to use, built by `toTestAccountSummary`, which has no password to give.
    testAccount: options.testAccount,
    results: row.results.map(toTestResultRow),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTestResultRow(row: AssignmentDetailRow['results'][number]): TestResultRow {
  return {
    id: row.id,
    outcome: row.outcome,
    environment: row.environment,
    whatTested: row.whatTested,
    actualResult: row.actualResult,
    failureDescription: row.failureDescription,
    severity: row.severity,
    browserDevice: row.browserDevice,
    commentForDeveloper: row.commentForDeveloper,
    retestRequired: row.retestRequired,
    evidenceFileId: row.evidenceFileId,
    recordedByName: row.recordedBy.name,
    createdAt: row.createdAt.toISOString(),
  };
}

/** What is being tested, in the words the tester's queue shows. */
function subjectLabel(row: AssignmentSummaryRow): string {
  if (row.task) {
    return `${row.task.project.code}-${row.task.number} ${row.task.title}`;
  }
  if (row.ticket) {
    return `T-${row.ticket.number} ${row.ticket.title}`;
  }
  if (row.release) {
    return `${row.release.version} ${row.release.title}`;
  }
  return row.project.name;
}

function isOverdue(row: AssignmentSummaryRow, now: Date): boolean {
  return (
    row.dueAt !== null && row.dueAt < now && OPEN_TESTING_ASSIGNMENT_STATUSES.includes(row.status)
  );
}
