import { TASK_STATUS } from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import { DashboardQueries, dashboardContext } from './dashboard-queries';

interface TaskFixture {
  assignedToId: string | null;
  status: string;
  dueDate: Date | null;
}

const ORG = 'org-1';
const TODAY = dashboardContext(ORG, 'me').today;
const YESTERDAY = new Date(TODAY.getTime() - 86_400_000);
const TOMORROW = new Date(TODAY.getTime() + 86_400_000);

const MEMBERS = [
  { userId: 'u1', title: 'Developer', user: { id: 'u1', name: 'Aisha', email: 'a@x' } },
  { userId: 'u2', title: 'Tester', user: { id: 'u2', name: 'Bo', email: 'b@x' } },
  { userId: 'u3', title: 'Lead', user: { id: 'u3', name: 'Cy', email: 'c@x' } },
];

const OPEN = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.IN_REVIEW,
  TASK_STATUS.BLOCKED,
] as string[];

const TASKS: TaskFixture[] = [
  { assignedToId: 'u1', status: TASK_STATUS.IN_PROGRESS, dueDate: YESTERDAY },
  { assignedToId: 'u1', status: TASK_STATUS.IN_PROGRESS, dueDate: TOMORROW },
  { assignedToId: 'u1', status: TASK_STATUS.IN_REVIEW, dueDate: null },
  { assignedToId: 'u1', status: TASK_STATUS.BLOCKED, dueDate: YESTERDAY },
  { assignedToId: 'u1', status: TASK_STATUS.ASSIGNED, dueDate: null },
  { assignedToId: 'u2', status: TASK_STATUS.IN_REVIEW, dueDate: YESTERDAY },
  { assignedToId: 'u2', status: TASK_STATUS.COMPLETED, dueDate: YESTERDAY },
  // Unassigned and another person's: neither may reach a counter.
  { assignedToId: null, status: TASK_STATUS.IN_PROGRESS, dueDate: YESTERDAY },
  { assignedToId: 'someone-else', status: TASK_STATUS.BLOCKED, dueDate: YESTERDAY },
];

/** What `workload` used to compute in JavaScript, kept as the oracle for the grouped queries. */
function countedInJs(userId: string) {
  const mine = TASKS.filter((task) => task.assignedToId === userId && OPEN.includes(task.status));
  return {
    openTasks: mine.length,
    inProgress: mine.filter((task) => task.status === TASK_STATUS.IN_PROGRESS).length,
    inReview: mine.filter((task) => task.status === TASK_STATUS.IN_REVIEW).length,
    overdue: mine.filter((task) => task.dueDate !== null && task.dueDate < TODAY).length,
    blocked: mine.filter((task) => task.status === TASK_STATUS.BLOCKED).length,
  };
}

interface GroupArgs {
  by: string[];
  where: { assignedToId?: { in: string[] }; dueDate?: { lt: Date }; organizationId?: string };
}

function fakePrisma() {
  const calls: string[] = [];
  const wheres: GroupArgs['where'][] = [];
  const matching = (where: GroupArgs['where']) =>
    TASKS.filter(
      (task) =>
        task.assignedToId !== null &&
        (where.assignedToId?.in ?? []).includes(task.assignedToId) &&
        OPEN.includes(task.status) &&
        (!where.dueDate || (task.dueDate !== null && task.dueDate < where.dueDate.lt)),
    );
  const prisma = {
    organizationMembership: {
      findMany: () => {
        calls.push('organizationMembership.findMany');
        return Promise.resolve(MEMBERS);
      },
    },
    workLog: {
      groupBy: () => {
        calls.push('workLog.groupBy');
        return Promise.resolve([{ userId: 'u1', _sum: { minutes: 120 } }]);
      },
    },
    task: {
      findMany: () => {
        calls.push('task.findMany');
        return Promise.resolve([]);
      },
      groupBy: (args: GroupArgs) => {
        calls.push(`task.groupBy(${args.by.join('+')})`);
        wheres.push(args.where);
        const buckets = new Map<string, number>();
        for (const task of matching(args.where)) {
          const key = args.by.includes('status')
            ? `${String(task.assignedToId)}|${task.status}`
            : `${String(task.assignedToId)}|`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        return Promise.resolve(
          [...buckets].map(([key, count]) => ({
            assignedToId: key.split('|')[0],
            status: key.split('|')[1],
            _count: { _all: count },
          })),
        );
      },
    },
  };
  return { prisma: prisma as unknown as PrismaService, calls, wheres };
}

describe('DashboardQueries.workload', () => {
  it('counts what the old per-row filtering counted, from grouped queries', async () => {
    const { prisma, calls } = fakePrisma();

    const rows = await new DashboardQueries(prisma, dashboardContext(ORG, 'me')).workload();

    expect(rows.map((row) => row.user.id)).toEqual(['u1', 'u2', 'u3']);
    for (const row of rows) {
      expect({
        openTasks: row.openTasks,
        inProgress: row.inProgress,
        inReview: row.inReview,
        overdue: row.overdue,
        blocked: row.blocked,
      }).toEqual(countedInJs(row.user.id));
    }
    expect(rows[0]?.minutesToday).toBe(120);
    expect(rows[1]?.minutesToday).toBe(0);
    // Two grouped queries, and no findMany over the tasks themselves.
    expect(calls).toContain('task.groupBy(assignedToId+status)');
    expect(calls).toContain('task.groupBy(assignedToId)');
    expect(calls).not.toContain('task.findMany');
  });

  it('keeps the tenant predicate on both grouped queries', async () => {
    const { prisma, wheres } = fakePrisma();

    await new DashboardQueries(prisma, dashboardContext(ORG, 'me')).workload(['u1']);

    expect(wheres).toHaveLength(2);
    for (const where of wheres) {
      expect(where.organizationId).toBe(ORG);
      expect(where.assignedToId).toEqual({ in: ['u1', 'u2', 'u3'] });
    }
  });
});
