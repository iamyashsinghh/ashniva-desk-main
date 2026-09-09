import { OPEN_TICKET_STATUSES, type TicketStatus } from './ticket-status';
import { OPEN_TASK_STATUSES, TASK_STATUS, type TaskStatus } from './task-status';

/**
 * How much work somebody is already holding, for the purpose of the routing workload limit.
 *
 * The rule, stated once here so the router, the screen and the tests cannot disagree:
 *
 * > **Active workload = open tickets assigned to the person + tasks they have actually started.**
 *
 * Two decisions are worth defending.
 *
 * *Why tickets and tasks rather than tickets alone.* A developer with nine tasks in flight is not
 * free because none of them is a ticket. The requirement asks for active tickets and active tasks,
 * and routing that ignored the tasks would send support work to whoever happens to be doing
 * project work instead.
 *
 * *Why only started tasks.* A task sitting in DRAFT or ASSIGNED is a plan, not load: a backlog
 * groomed onto somebody would otherwise make them permanently ineligible for support. BLOCKED is
 * not load either — that is work they cannot do. Everything else that is open is work they are
 * carrying, including the states it comes *back* in after a failed QA.
 *
 * Nothing closed is ever counted, and the sets below are the whole definition; there is no second
 * place that decides what "busy" means. Note that the task set is derived by exclusion rather than
 * listed: a task status added later counts as load unless somebody deliberately exempts it, which
 * is the safer way round to be wrong.
 */

/** Ticket statuses that count towards somebody's load: every open one. */
export const WORKLOAD_TICKET_STATUSES: readonly TicketStatus[] = OPEN_TICKET_STATUSES;

/** Open task statuses that are not yet, or no longer, work in hand. */
const NOT_YET_LOAD: readonly TaskStatus[] = [
  TASK_STATUS.DRAFT,
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.BLOCKED,
];

/** Task statuses that count: started, not merely planned, and not blocked. */
export const WORKLOAD_TASK_STATUSES: readonly TaskStatus[] = OPEN_TASK_STATUSES.filter(
  (status) => !NOT_YET_LOAD.includes(status),
);

export interface WorkloadCounts {
  openTickets: number;
  activeTasks: number;
}

/** The one number the limit is compared against. */
export function activeWorkload(counts: WorkloadCounts): number {
  return counts.openTickets + counts.activeTasks;
}

/**
 * Whether somebody has room for one more.
 *
 * A null or zero limit means "no ceiling" rather than "no capacity" — the alternative reading
 * would make an unconfigured project route nothing at all, which is the worst possible default.
 */
export function hasCapacity(counts: WorkloadCounts, limit: number | null | undefined): boolean {
  if (limit === null || limit === undefined || limit <= 0) {
    return true;
  }
  return activeWorkload(counts) < limit;
}
