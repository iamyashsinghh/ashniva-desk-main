import { OPERATIONS_TODAY_STATUSES, type OperationsToday, type TaskStatus } from '@ashniva/types';

import {
  scheduledBetweenWhere,
  startedBetweenWhere,
  upcomingWhere,
} from '../../tasks/task-windows';
import { OPEN_TASKS, type DashboardQueries } from '../dashboard-queries';
import type { OperationsFilters } from './operations-filters';

/**
 * What the scope's people are doing today.
 *
 * Six queries however many statuses are reported: the four pipeline states come out of a single
 * `groupBy` and the five date-shaped ones are counts, because a count is the only number that
 * still matches the list a card opens once the list is longer than a page.
 */
export async function buildOperationsToday(
  q: DashboardQueries,
  filters: OperationsFilters,
  now: Date,
): Promise<OperationsToday> {
  const { today, tomorrow } = q.ctx;
  const people = filters.people;
  const [byStatus, scheduled, started, completed, overdue, upcoming] = await Promise.all([
    q.groupTasksByStatus({ ...people, status: { in: OPEN_TASKS } }),
    q.countTasks({ ...people, ...scheduledBetweenWhere(today, tomorrow) }),
    q.countTasks({ ...people, ...startedBetweenWhere(today, tomorrow) }),
    q.countTasks(q.completedToday(people)),
    q.countTasks(q.overdue(people)),
    q.countTasks({ ...people, ...upcomingWhere(now) }),
  ]);
  const inState = (statuses: readonly TaskStatus[]): number =>
    statuses.reduce((total, status) => total + (byStatus.get(status) ?? 0), 0);
  return {
    scheduled,
    started,
    completed,
    overdue,
    upcoming,
    blocked: inState(OPERATIONS_TODAY_STATUSES.blocked),
    returnedToDeveloper: inState(OPERATIONS_TODAY_STATUSES.returnedToDeveloper),
    waitingForReview: inState(OPERATIONS_TODAY_STATUSES.waitingForReview),
    waitingForQa: inState(OPERATIONS_TODAY_STATUSES.waitingForQa),
  };
}
