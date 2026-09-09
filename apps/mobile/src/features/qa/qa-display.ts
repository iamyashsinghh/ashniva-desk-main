import {
  TESTER_VIEW,
  TESTING_ASSIGNMENT_STATUS,
  type TestingAssignmentStatus,
  type TesterView,
} from '@ashniva/types';

import type { SegmentOption } from '../../shared/components/navigation-list';
import type { PillTone } from '../../shared/components/primitives';

/**
 * The tester's queue, phone-sized.
 *
 * The API offers nine views. A phone shows four, and the choice is about what a tester does while
 * not at their desk: what is mine, what is ready to pick up, what failed and needs writing up,
 * and what is late. The other five — today, passed today, UAT, live, retest — are ways of
 * reviewing a day's work, which is a desk activity.
 */
export const PHONE_TESTER_VIEWS: readonly SegmentOption<TesterView>[] = [
  { value: TESTER_VIEW.MINE, label: 'Mine' },
  { value: TESTER_VIEW.READY, label: 'Ready' },
  { value: TESTER_VIEW.FAILED, label: 'Failed' },
  { value: TESTER_VIEW.OVERDUE, label: 'Overdue' },
];

const STATUS_LABELS: Record<TestingAssignmentStatus, string> = {
  PENDING: 'Not started',
  IN_PROGRESS: 'In progress',
  PASSED: 'Passed',
  FAILED: 'Failed',
  CLARIFICATION: 'Waiting on the developer',
  CANCELLED: 'Cancelled',
};

const STATUS_TONES: Record<TestingAssignmentStatus, PillTone> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'progress',
  PASSED: 'success',
  FAILED: 'danger',
  CLARIFICATION: 'warning',
  CANCELLED: 'neutral',
};

export function assignmentStatusLabel(status: TestingAssignmentStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function assignmentStatusTone(status: TestingAssignmentStatus): PillTone {
  return STATUS_TONES[status] ?? 'neutral';
}

/** Whether the assignment is in a state the tester can start from. */
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
