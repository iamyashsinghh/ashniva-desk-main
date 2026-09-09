import { OPEN_TASK_STATUSES } from '@ashniva/types';

import type { Prisma } from '../../generated/prisma/client';

/**
 * The time windows a task list and a dashboard card both ask about.
 *
 * One definition each, for the same reason `slaTicketWhere` exists: the operational dashboard
 * counts these and then links to the list that shows them, and a card whose number and
 * destination disagree is worse than no card. Both sides call the functions below, so they cannot
 * drift apart without the test noticing.
 */

/** Past due and still open. Completed and cancelled tasks are never overdue. */
export function overdueWhere(asOf: Date): Prisma.TaskWhereInput {
  return { dueDate: { lt: asOf }, status: { in: [...OPEN_TASK_STATUSES] } };
}

/**
 * Open work whose scheduled start falls in the window.
 *
 * Open, because "scheduled to start today" is a question about work somebody still has to pick
 * up; a task that was scheduled for this morning and is already finished is not on anybody's
 * list any more.
 */
export function scheduledBetweenWhere(from: Date, to: Date): Prisma.TaskWhereInput {
  return { scheduledStartAt: { gte: from, lt: to }, status: { in: [...OPEN_TASK_STATUSES] } };
}

/**
 * Work actually begun in the window, whatever became of it since.
 *
 * No status narrowing here on purpose: a task started this morning and finished this afternoon
 * still started today, and dropping it would make the number smaller every time somebody
 * finished something.
 */
export function startedBetweenWhere(from: Date, to: Date): Prisma.TaskWhereInput {
  return { startedAt: { gte: from, lt: to } };
}

/** Assigned and open, but the scheduled start is still ahead: work that is coming, not work now. */
export function upcomingWhere(now: Date): Prisma.TaskWhereInput {
  return { scheduledStartAt: { gt: now }, status: { in: [...OPEN_TASK_STATUSES] } };
}
