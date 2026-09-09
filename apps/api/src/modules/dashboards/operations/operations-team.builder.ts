import { TASK_STATUS, type OperationsTeamMember, type TaskRef } from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import { taskKey } from '../../tasks/tasks.mapper';
import { OPEN_TASKS, type DashboardQueries } from '../dashboard-queries';
import type { OperationsMember } from './operations-members';

interface CurrentTaskRow {
  id: string;
  number: number;
  title: string;
  assignedToId: string | null;
  project: { code: string };
}

/** Per-person tallies, folded out of the grouped rows. */
interface MemberCounts {
  open: number;
  inProgress: number;
  dueToday: number;
  delayed: number;
}

/**
 * What each person in scope is holding.
 *
 * **Counted, not fetched.** This read the whole open backlog for everyone in scope and tallied it
 * in memory, which is fine for one lead's team and is every open task in the installation for a
 * manager — on a dashboard that refetches every minute, per manager. The four numbers each person
 * needs are aggregates, so they are asked for as aggregates; the only rows fetched are the ones
 * actually rendered, which is at most one in-progress task per person.
 *
 * Four queries however many people *and however many tasks* are in scope. That is the property
 * that matters: the previous version was bounded by the team and unbounded by the backlog, and the
 * backlog is the thing that grows.
 *
 * Counts of work in a state, never a rate or a ranking. This says who is carrying what right now,
 * so it can be moved; it says nothing about how well anybody works.
 */
export async function buildOperationsTeam(
  q: DashboardQueries,
  prisma: PrismaService,
  members: OperationsMember[],
): Promise<OperationsTeamMember[]> {
  const ids = members.map((member) => member.userId);
  if (ids.length === 0) {
    return [];
  }
  const { today } = q.ctx;
  const assigned = { assignedToId: { in: ids }, status: { in: OPEN_TASKS } };

  const [byStatus, dueToday, delayed, current, minutes] = await Promise.all([
    prisma.task.groupBy({
      by: ['assignedToId', 'status'],
      where: q.taskWhere(assigned),
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['assignedToId'],
      where: q.taskWhere({ ...assigned, dueDate: today }),
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ['assignedToId'],
      where: q.taskWhere({ ...assigned, dueDate: { lt: today } }),
      _count: { _all: true },
    }),
    // The only rows rendered. Bounded by the number of people, because a person has one task in
    // hand — and ordered so "the task they are on right now" is the same answer on every load:
    // the one due soonest, not whichever row the database happened to return first.
    prisma.task.findMany({
      where: q.taskWhere({ assignedToId: { in: ids }, status: TASK_STATUS.IN_PROGRESS }),
      select: {
        id: true,
        number: true,
        title: true,
        assignedToId: true,
        project: { select: { code: true } },
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }],
    }),
    q.minutesToday(ids),
  ]);

  const counts = foldCounts(byStatus, dueToday, delayed);
  const currentByAssignee = firstPerAssignee(current);

  return members.map((member) => {
    const mine = counts.get(member.userId);
    const task = currentByAssignee.get(member.userId);
    return {
      user: member.user,
      title: member.title,
      openTasks: mine?.open ?? 0,
      inProgress: mine?.inProgress ?? 0,
      dueToday: mine?.dueToday ?? 0,
      delayed: mine?.delayed ?? 0,
      minutesToday: minutes.get(member.userId) ?? 0,
      currentTask: task ? toTaskRef(task) : null,
    };
  });
}

type StatusGroup = { assignedToId: string | null; status: string; _count: { _all: number } };
type PersonGroup = { assignedToId: string | null; _count: { _all: number } };

/** Three grouped result sets into one tally per person. */
function foldCounts(
  byStatus: StatusGroup[],
  dueToday: PersonGroup[],
  delayed: PersonGroup[],
): Map<string, MemberCounts> {
  const counts = new Map<string, MemberCounts>();
  const entry = (userId: string): MemberCounts => {
    let value = counts.get(userId);
    if (!value) {
      value = { open: 0, inProgress: 0, dueToday: 0, delayed: 0 };
      counts.set(userId, value);
    }
    return value;
  };

  for (const row of byStatus) {
    if (row.assignedToId === null) {
      continue;
    }
    const tally = entry(row.assignedToId);
    tally.open += row._count._all;
    if (row.status === TASK_STATUS.IN_PROGRESS) {
      tally.inProgress += row._count._all;
    }
  }
  for (const row of dueToday) {
    if (row.assignedToId !== null) {
      entry(row.assignedToId).dueToday = row._count._all;
    }
  }
  for (const row of delayed) {
    if (row.assignedToId !== null) {
      entry(row.assignedToId).delayed = row._count._all;
    }
  }
  return counts;
}

/** The first row for each assignee, the list already being in the order the caller wants. */
function firstPerAssignee(rows: CurrentTaskRow[]): Map<string, CurrentTaskRow> {
  const first = new Map<string, CurrentTaskRow>();
  for (const row of rows) {
    if (row.assignedToId !== null && !first.has(row.assignedToId)) {
      first.set(row.assignedToId, row);
    }
  }
  return first;
}

function toTaskRef(row: CurrentTaskRow): TaskRef {
  return { id: row.id, key: taskKey(row), title: row.title };
}
