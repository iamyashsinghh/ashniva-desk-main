import {
  TEST_RESULT,
  TESTING_ASSIGNMENT_STATUS,
  type TestAccountSummary,
  type TestResult,
  type TestSeverity,
  type TestingAssignmentDetail,
  type TestingAssignmentStatus,
} from '@ashniva/types';

import type { PillTone } from '../../shared/components/primitives';
import type { AttachmentTarget } from '../../shared/attachments/attachments';
import { ASSIGNMENT_STATUS_LABELS, ASSIGNMENT_STATUS_TONES } from './qa-labels';

/**
 * What the QA screens draw, and why a control is off.
 *
 * None of this is authority. The transition rules live in the API's
 * `testing-assignment-workflow.ts` and every refusal comes back from it word for word; what is
 * here decides which controls to draw and what a disabled one says would turn it on.
 */

export function assignmentStatusLabel(status: TestingAssignmentStatus): string {
  return ASSIGNMENT_STATUS_LABELS[status] ?? status;
}

export function assignmentStatusTone(status: TestingAssignmentStatus): PillTone {
  return ASSIGNMENT_STATUS_TONES[status] ?? 'neutral';
}

/** The three statuses an assignment can still be worked from. */
export const OPEN_ASSIGNMENT_STATUSES: readonly TestingAssignmentStatus[] = [
  TESTING_ASSIGNMENT_STATUS.PENDING,
  TESTING_ASSIGNMENT_STATUS.IN_PROGRESS,
  TESTING_ASSIGNMENT_STATUS.CLARIFICATION,
];

export function isOpen(status: TestingAssignmentStatus): boolean {
  return OPEN_ASSIGNMENT_STATUSES.includes(status);
}

/** Whether the assignment is in a state the tester can start (or pick back up) from. */
export function canStart(status: TestingAssignmentStatus): boolean {
  return (
    status === TESTING_ASSIGNMENT_STATUS.PENDING ||
    status === TESTING_ASSIGNMENT_STATUS.CLARIFICATION
  );
}

/** Whether a result can be recorded. The API enforces the same rule in its workflow file. */
export function canRecordResult(status: TestingAssignmentStatus): boolean {
  return status === TESTING_ASSIGNMENT_STATUS.IN_PROGRESS;
}

/**
 * Why every working control on an assignment is off, when it is. An unassigned assignment is
 * claimable by anyone who may record results — that is what "ready for testing" is for.
 */
export function blockedReason(
  canRecord: boolean,
  assignment: Pick<TestingAssignmentDetail, 'assignedToUserId' | 'assignedToName'>,
  myId: string | undefined,
): string | null {
  if (!canRecord) {
    return 'Recording a test result needs the qa:record-result permission';
  }
  const mine = assignment.assignedToUserId === null || assignment.assignedToUserId === myId;
  if (!mine) {
    return `Only ${assignment.assignedToName ?? 'the assigned tester'} can do this`;
  }
  return null;
}

/** Why the reveal button is off. Never "you cannot" alone — always what would turn it on. */
export function revealBlockedReason({
  account,
  hasOwnGrant,
  canReveal,
  canManage,
}: {
  account: Pick<TestAccountSummary, 'isActive' | 'hasActiveGrant'>;
  hasOwnGrant: boolean;
  canReveal: boolean;
  canManage: boolean;
}): string | null {
  if (!canReveal) {
    return 'Reading a test password needs the test-credential:reveal permission';
  }
  if (!account.isActive) {
    return 'This login has been retired';
  }
  if (hasOwnGrant) {
    return null;
  }
  if (account.hasActiveGrant) {
    return canManage
      ? 'Your grant was issued elsewhere — grant yourself access here to read it'
      : 'Your grant was issued elsewhere — ask for it to be granted again from this screen';
  }
  return canManage
    ? 'Grant yourself access first; every reveal is logged against that grant'
    : 'Ask whoever looks after this login to grant you access';
}

export interface ResultDraft {
  result: TestResult;
  whatTested: string;
  actualResult: string;
  failureDescription: string;
  severity: TestSeverity | null;
}

/**
 * What is still missing from a result, in the words the form uses to explain itself — the same
 * rule `RecordTestResultDto` and the workflow service enforce, repeated so the person typing
 * finds out before they submit.
 */
export function missingResultFields(draft: ResultDraft): string[] {
  const missing: string[] = [];
  if (draft.whatTested.trim().length < 3) {
    missing.push('what you tested');
  }
  if (draft.actualResult.trim().length < 3) {
    missing.push('what actually happened');
  }
  if (draft.result === TEST_RESULT.FAIL) {
    if (draft.failureDescription.trim().length < 3) {
      missing.push('what is broken');
    }
    if (!draft.severity) {
      missing.push('a severity');
    }
  }
  return missing;
}

/** Where evidence is filed: the work the assignment is about, or its project for a release. */
export function evidenceTarget(
  assignment: Pick<TestingAssignmentDetail, 'taskId' | 'ticketId' | 'projectId'>,
): AttachmentTarget {
  if (assignment.taskId) {
    return { taskId: assignment.taskId };
  }
  if (assignment.ticketId) {
    return { ticketId: assignment.ticketId };
  }
  return { projectId: assignment.projectId };
}
