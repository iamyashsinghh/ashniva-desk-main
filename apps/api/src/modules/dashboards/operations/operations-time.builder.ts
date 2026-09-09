import {
  AT_RISK_WINDOW_MINUTES,
  TASK_TIMING,
  computeTaskTiming,
  type OperationsTime,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import { OPEN_TASKS, type DashboardQueries } from '../dashboard-queries';
import type { OperationsFilters } from './operations-filters';

const MINUTE = 60_000;

/** How many rows the "closest to their deadline" card shows. The KPIs above it are counted. */
const TASK_LIST_SIZE = 12;

/**
 * Estimated against actual, and whether the work will land on time.
 *
 * The four open buckets are `computeTaskTiming`'s own verdicts expressed as SQL, using the same
 * `AT_RISK_WINDOW_MINUTES` constant it does, so the number on a card and the badge on a row in
 * the list below it cannot disagree. They are counts rather than a fold over a fetched list,
 * because a fold is only right until there are more tasks than the list shows.
 *
 * Today's completions are folded rather than counted, and that is deliberate: "finished before it
 * was due" compares two columns, which SQL will not do through Prisma, and a day's completions is
 * a bounded set — it does not grow with the size of the installation.
 *
 * Per-task facts only. Nothing here is averaged across a person, and no total is carried from one
 * day into the next; see the note at the top of `task-timing.ts`.
 */
export async function buildOperationsTime(
  q: DashboardQueries,
  prisma: PrismaService,
  filters: OperationsFilters,
  now: Date,
  /**
   * Whether the caller may see the per-task list under the tiles.
   *
   * The tiles are counts of work in a state and are ungated. The list is not: `q.tasks` returns
   * `TaskSummary`, which carries the assignee and that task's logged minutes — for the twelve most
   * urgent open tasks in scope. That is the raw material of the per-person load `report:read-team`
   * gates the Team section to withhold, so withholding it there and handing it over here would
   * have been a gate in name only.
   */
  includeTaskList: boolean,
): Promise<OperationsTime> {
  const scope = { ...filters.people, status: { in: OPEN_TASKS } };
  const atRiskFrom = new Date(now.getTime() + AT_RISK_WINDOW_MINUTES * MINUTE);
  const [delayed, atRisk, inHand, unscheduled, estimate, logged, finished, tasks] =
    await Promise.all([
      q.countTasks({ ...scope, dueAt: { lt: now } }),
      q.countTasks({ ...scope, dueAt: { gte: now, lte: atRiskFrom } }),
      q.countTasks({ ...scope, dueAt: { gt: atRiskFrom } }),
      q.countTasks({ ...scope, dueAt: null }),
      prisma.task.aggregate({
        where: q.taskWhere(scope),
        _sum: { estimateMinutes: true },
      }),
      prisma.workLog.aggregate({
        where: { organizationId: q.ctx.organizationId, task: q.taskWhere(scope) },
        _sum: { minutes: true },
      }),
      prisma.task.findMany({
        where: q.taskWhere(q.completedToday(filters.people)),
        select: { dueAt: true, completedAt: true },
      }),
      includeTaskList
        ? q.tasks({ ...scope, dueAt: { not: null } }, TASK_LIST_SIZE, [{ dueAt: 'asc' }])
        : Promise.resolve([]),
    ]);

  const completed = { onTime: 0, late: 0, unscheduled: 0 };
  for (const row of finished) {
    // Effort is irrelevant to the on-time verdict, so it is not fetched: `computeTaskTiming`
    // decides ON_TIME / DELAYED / UNSCHEDULED from the two instants alone.
    const timing = computeTaskTiming({
      dueAt: row.dueAt,
      completedAt: row.completedAt,
      estimateMinutes: null,
      loggedMinutes: 0,
      now,
    });
    if (timing.status === TASK_TIMING.DELAYED) {
      completed.late += 1;
    } else if (timing.status === TASK_TIMING.UNSCHEDULED) {
      completed.unscheduled += 1;
    } else {
      completed.onTime += 1;
    }
  }

  return {
    inHand,
    atRisk,
    delayed,
    unscheduled,
    completedOnTime: completed.onTime,
    completedLate: completed.late,
    completedUnscheduled: completed.unscheduled,
    estimateMinutes: estimate._sum.estimateMinutes ?? 0,
    loggedMinutes: logged._sum.minutes ?? 0,
    tasks,
  };
}
