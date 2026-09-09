import {
  TESTER_VIEW,
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type TesterView,
} from '@ashniva/types';

import type { Prisma } from '../../generated/prisma/client';
import { OPEN_TESTING_ASSIGNMENT_STATUSES } from './testing-assignment-workflow';

const DAY_MS = 24 * 60 * 60 * 1000;
const K = TESTING_ASSIGNMENT_KIND;
const S = TESTING_ASSIGNMENT_STATUS;
const OPEN = [...OPEN_TESTING_ASSIGNMENT_STATUSES];

/** Midnight on the current server day, so a count and the list behind it agree. */
export function todayUtc(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

export interface TesterViewScope {
  organizationId: string;
  /** Whose queue this is. Views are personal: "mine" and "ready" mean this person. */
  userId: string;
  now: Date;
  projectId?: string;
  /**
   * The caller's task scope, from `TaskVisibilityService.testingAssignmentWhere`.
   *
   * Six of the nine views — failed, retest, passed-today, uat, live and overdue — ask a question
   * about the organization rather than about the caller, so they listed every assignment in the
   * tenant along with what was developed, what to test and the developer's notes. Undefined means
   * an organization-wide reader, which is a different thing from no scope at all.
   */
  visibility?: Prisma.TestingAssignmentWhereInput;
}

/**
 * The nine tester views, as one where-clause each.
 *
 * They are defined here rather than in the repository because the counts and the list have to be
 * the same question asked twice — a card that says 4 and opens a list of 6 is worse than no card.
 * Everything below narrows `base`, so tenant scope cannot be lost by adding a view.
 */
export function testerViewWhere(
  view: TesterView,
  scope: TesterViewScope,
): Prisma.TestingAssignmentWhereInput {
  const base: Prisma.TestingAssignmentWhereInput = {
    ...(scope.visibility ? { AND: scope.visibility } : {}),
    organizationId: scope.organizationId,
    deletedAt: null,
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
  };
  const today = todayUtc();

  switch (view) {
    case TESTER_VIEW.MINE:
      return { ...base, assignedToUserId: scope.userId, status: { in: OPEN } };
    case TESTER_VIEW.READY:
      // Waiting to be picked up: handed to this tester, or to nobody yet.
      return {
        ...base,
        status: S.PENDING,
        OR: [{ assignedToUserId: scope.userId }, { assignedToUserId: null }],
      };
    case TESTER_VIEW.TODAY:
      return {
        ...base,
        assignedToUserId: scope.userId,
        status: { in: OPEN },
        dueAt: { gte: today, lt: new Date(today.getTime() + DAY_MS) },
      };
    case TESTER_VIEW.FAILED:
      return { ...base, status: S.FAILED };
    case TESTER_VIEW.RETEST:
      // Two things need a retest: work already re-assigned as one, and a failure whose tester
      // asked for one and which nobody has re-assigned yet. The second is the one that goes
      // missing otherwise.
      return {
        ...base,
        OR: [
          { kind: K.RETEST, status: { in: OPEN } },
          { status: S.FAILED, results: { some: { retestRequired: true } } },
        ],
      };
    case TESTER_VIEW.PASSED_TODAY:
      return { ...base, status: S.PASSED, completedAt: { gte: today } };
    case TESTER_VIEW.UAT:
      return { ...base, kind: K.UAT, status: { in: OPEN } };
    case TESTER_VIEW.LIVE:
      return { ...base, kind: K.LIVE_VERIFICATION, status: { in: OPEN } };
    case TESTER_VIEW.OVERDUE:
      return { ...base, status: { in: OPEN }, dueAt: { lt: scope.now } };
    default:
      return { ...base, status: { in: OPEN } };
  }
}

export const TESTER_VIEWS: readonly TesterView[] = Object.values(TESTER_VIEW);
