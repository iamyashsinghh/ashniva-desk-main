import {
  OPEN_TASK_STATUSES,
  TASK_LIST_VIEW,
  TASK_STATUS,
  type AuthenticatedUser,
  type TaskStatus,
} from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { ListTasksQueryDto } from './dto/task.dto';
import { todayUtc } from './tasks.mapper';
import type { TaskListFilter } from './tasks.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the "current work" views show by default. It is the shared definition from
 * @ashniva/types, not a local copy: the dashboards count with the same list, and a hand-written
 * subset here silently disagreed with them (it left out drafts) and would have hidden the later
 * pipeline statuses as they are introduced.
 */
export function openStatuses(): TaskStatus[] {
  return [...OPEN_TASK_STATUSES];
}

/**
 * The person plus everyone in the teams they lead **or belong to**. This is the one definition of
 * "my team" for task queries: the team list view and the dashboards that link to it share it.
 *
 * Named `teamPeerIds` rather than `teamMemberIds` because there were two functions by the latter
 * name with different answers — this one keeps the caller, `DashboardQueries`' dropped them — and
 * a reader had no way to tell from a call site which they had. `DashboardQueries` now derives its
 * answer from this one instead of asking the database a second, slightly different question.
 *
 * It selects *people*, which is not the same question as who may read a task: peers on a team you
 * merely belong to are not in your read scope (see `TaskVisibilityService`). The two compose —
 * `view=team` picks the people, the scope decides which of their tasks come back.
 */
export async function teamPeerIds(
  prisma: PrismaService,
  organizationId: string,
  userId: string,
): Promise<string[]> {
  const teams = await prisma.team.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [{ leadUserId: userId }, { members: { some: { userId } } }],
    },
    select: { members: { select: { userId: true } } },
  });
  const ids = new Set<string>([userId]);
  for (const team of teams) {
    for (const member of team.members) {
      ids.add(member.userId);
    }
  }
  return [...ids];
}

/**
 * Turns a list view ("my", "team", "today", …) into the repository filter.
 *
 * `visibility` is threaded through every branch, including `all`: a view says which slice of the
 * caller's work they are looking at, never how much of the organization they may see.
 */
export async function buildTaskListFilter(
  prisma: PrismaService,
  actor: AuthenticatedUser,
  query: ListTasksQueryDto,
  visibility?: Prisma.TaskWhereInput,
): Promise<TaskListFilter> {
  const today = todayUtc();
  // One instant for the whole request, so `my` and `upcoming` cannot both miss a task that
  // becomes workable between two clock reads.
  const now = new Date();
  const base: TaskListFilter = {
    organizationId: actor.organizationId,
    visibility,
    status: query.status,
    projectId: query.projectId,
    assignedToId: query.assignedToId,
    priority: query.priority,
    search: query.search,
    limit: query.limit,
    cursor: query.cursor,
    // Ordinary boards never mix in intern learning work; the Intern view opts in.
    isInternTask: (query.view ?? TASK_LIST_VIEW.MY) === TASK_LIST_VIEW.INTERN,
    // These narrow whatever the view selected; they never decide the scope themselves, so a
    // dashboard card can point at exactly the set of tasks it counted.
    ...(query.overdue ? { overdueAsOf: today } : {}),
    ...(query.completedToday
      ? { completedFrom: today, completedTo: new Date(today.getTime() + DAY_MS) }
      : {}),
    ...(query.scheduledToday
      ? { scheduledFrom: today, scheduledTo: new Date(today.getTime() + DAY_MS) }
      : {}),
    ...(query.startedToday
      ? { startedFrom: today, startedTo: new Date(today.getTime() + DAY_MS) }
      : {}),
    ...(query.upcoming ? { upcomingAsOf: now } : {}),
  };
  // Views that mean "current work" default to the open statuses, but a question about *what
  // happened today* overrides that.
  //
  // `startedToday` belongs in this exception and was missing from it. A task started at 09:00 and
  // finished at 14:00 still started today — the operations card counts it deliberately, and says
  // so — but the list it links to was defaulting to the open statuses and dropping it. The card
  // read 1 and the list it opened read 0, which is exactly the disagreement this module exists to
  // prevent.
  const askingAboutToday = query.completedToday || query.startedToday;
  const defaultStatus = query.status ?? (askingAboutToday ? undefined : openStatuses());
  switch (query.view ?? TASK_LIST_VIEW.MY) {
    case TASK_LIST_VIEW.MY:
      // Work that can be picked up now. A task scheduled to begin later is assigned but is not
      // yet the developer's problem, so it waits in Upcoming rather than padding today's queue.
      return {
        ...base,
        assignedToId: actor.userId,
        status: defaultStatus,
        notScheduledAfter: now,
      };
    case TASK_LIST_VIEW.UPCOMING:
      // The other half of the same split: assigned, scheduled, not yet startable.
      return {
        ...base,
        assignedToId: query.assignedToId ?? actor.userId,
        status: defaultStatus,
        scheduledAfter: now,
      };
    case TASK_LIST_VIEW.BY_ME:
      // Open work by default, like the my and team views, so the "Assigned by me" card and this
      // list count the same thing.
      return { ...base, createdById: actor.userId, status: defaultStatus };
    case TASK_LIST_VIEW.TEAM:
      return {
        ...base,
        assigneeIds: await teamPeerIds(prisma, actor.organizationId, actor.userId),
        status: defaultStatus,
      };
    case TASK_LIST_VIEW.TODAY:
      return {
        ...base,
        assignedToId: query.assignedToId ?? actor.userId,
        dueOn: today,
        status: defaultStatus,
      };
    case TASK_LIST_VIEW.OVERDUE:
      // "My overdue work", the same set the developer and team-lead dashboards count. A wider
      // scope is asked for with an explicit view plus overdue=true (e.g. view=all&overdue=true).
      return { ...base, assignedToId: query.assignedToId ?? actor.userId, overdueAsOf: today };
    case TASK_LIST_VIEW.REVIEW:
      return { ...base, reviewFor: actor.userId, status: query.status ?? [TASK_STATUS.IN_REVIEW] };
    case TASK_LIST_VIEW.DONE:
      return {
        ...base,
        assignedToId: query.assignedToId ?? actor.userId,
        status: [TASK_STATUS.COMPLETED],
      };
    case TASK_LIST_VIEW.INTERN:
      return {
        ...base,
        status: defaultStatus,
      };
    case TASK_LIST_VIEW.ALL:
    default:
      return base;
  }
}
