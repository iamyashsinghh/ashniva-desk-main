import {
  AT_RISK_WINDOW_MINUTES,
  AVAILABILITY_STATUS,
  RELEASE_STATUS,
  TASK_STATUS,
  TASK_TIMING,
  computeTaskTiming,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { DashboardQueries, dashboardContext } from '../dashboard-queries';
import { buildOperationsAvailability } from './operations-availability.builder';
import type { OperationsFilters } from './operations-filters';
import type { OperationsMember } from './operations-members';
import { buildOperationsRelease } from './operations-release.builder';
import { buildOperationsSupport } from './operations-support.builder';
import { buildOperationsTeam } from './operations-team.builder';
import { buildOperationsTime } from './operations-time.builder';
import { buildOperationsToday } from './operations-today.builder';

const ORGANIZATION = 'org-ashniva';
const NOW = new Date('2026-09-16T10:00:00.000Z');
const TODAY = new Date('2026-09-16T00:00:00.000Z');

const MEMBERS: OperationsMember[] = [
  { userId: 'user-dev', title: 'Developer', user: { id: 'user-dev', name: 'Priya', email: 'p@x' } },
  { userId: 'user-qa', title: 'Tester', user: { id: 'user-qa', name: 'Kavya', email: 'k@x' } },
];

const TEAM_SCOPE: OperationsFilters = {
  people: { assignedToId: { in: ['user-dev', 'user-qa'] } },
  tickets: { projectId: { in: ['project-a'] } },
  projectIds: ['project-a'],
  organizationWide: false,
};

function queries(prisma: PrismaService): DashboardQueries {
  const context = { ...dashboardContext(ORGANIZATION, 'user-lead'), today: TODAY };
  return new DashboardQueries(prisma, {
    ...context,
    tomorrow: new Date(TODAY.getTime() + 86_400_000),
  });
}

/** Records the `where` of every `task.count` so a card's filter can be asserted, not guessed. */
function countingTasks(result = 0) {
  const wheres: Prisma.TaskWhereInput[] = [];
  const count = jest.fn(({ where }: { where: Prisma.TaskWhereInput }) => {
    wheres.push(where);
    return Promise.resolve(result);
  });
  return { count, wheres };
}

describe('buildOperationsToday', () => {
  it('reads every pipeline state out of one grouped query, and the dates as counts', async () => {
    const { count, wheres } = countingTasks(3);
    const groupBy = jest.fn().mockResolvedValue([
      { status: TASK_STATUS.BLOCKED, _count: { _all: 2 } },
      { status: TASK_STATUS.RETURNED_TO_DEV, _count: { _all: 1 } },
      { status: TASK_STATUS.IN_REVIEW, _count: { _all: 4 } },
      { status: TASK_STATUS.CODE_REVIEW, _count: { _all: 1 } },
      { status: TASK_STATUS.READY_FOR_QA, _count: { _all: 5 } },
    ]);
    const prisma = { task: { count, groupBy } } as unknown as PrismaService;

    const today = await buildOperationsToday(queries(prisma), TEAM_SCOPE, NOW);

    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(today).toMatchObject({
      blocked: 2,
      returnedToDeveloper: 1,
      // Both review states are one card: a lead asks "who is waiting on a reviewer", not which.
      waitingForReview: 5,
      waitingForQa: 5,
      scheduled: 3,
      started: 3,
    });
    // Five counts, and every one of them carries the team narrowing.
    expect(wheres).toHaveLength(5);
    for (const where of wheres) {
      expect(where).toMatchObject({
        organizationId: ORGANIZATION,
        deletedAt: null,
        assignedToId: { in: ['user-dev', 'user-qa'] },
      });
    }
  });
});

describe('buildOperationsTeam', () => {
  /**
   * The four numbers per person are aggregates, so they are asked for as aggregates.
   *
   * This used to read the whole open backlog for everyone in scope and tally it in memory, which
   * is bounded by the team and unbounded by the backlog — and the backlog is the thing that grows.
   * The only rows fetched now are the ones actually rendered: at most one in-progress task each.
   */
  it('counts with grouped queries and fetches only the tasks it renders', async () => {
    const groupBy = jest
      .fn()
      // by assignee and status
      .mockResolvedValueOnce([
        { assignedToId: 'user-dev', status: TASK_STATUS.IN_PROGRESS, _count: { _all: 1 } },
        { assignedToId: 'user-dev', status: TASK_STATUS.ASSIGNED, _count: { _all: 1 } },
        { assignedToId: null, status: TASK_STATUS.ASSIGNED, _count: { _all: 7 } },
      ])
      // due today
      .mockResolvedValueOnce([{ assignedToId: 'user-dev', _count: { _all: 1 } }])
      // delayed
      .mockResolvedValueOnce([{ assignedToId: 'user-dev', _count: { _all: 1 } }]);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 't1',
        number: 1,
        title: 'Checkout',
        assignedToId: 'user-dev',
        project: { code: 'ACM' },
      },
    ]);
    const workLogGroupBy = jest
      .fn()
      .mockResolvedValue([{ userId: 'user-dev', _sum: { minutes: 90 } }]);
    const prisma = {
      task: { groupBy, findMany },
      workLog: { groupBy: workLogGroupBy },
    } as unknown as PrismaService;

    const team = await buildOperationsTeam(queries(prisma), prisma, MEMBERS);

    // Three grouped counts and exactly one row read, however large the backlog is.
    expect(groupBy).toHaveBeenCalledTimes(3);
    expect(findMany).toHaveBeenCalledTimes(1);
    // The fetched rows are the in-progress ones only — the rest were never materialised.
    expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      status: TASK_STATUS.IN_PROGRESS,
    });
    // An unassigned row cannot be attributed to anybody and is dropped rather than guessed at.
    expect(team).toEqual([
      {
        user: MEMBERS[0]?.user,
        title: 'Developer',
        openTasks: 2,
        inProgress: 1,
        dueToday: 1,
        delayed: 1,
        minutesToday: 90,
        currentTask: { id: 't1', key: 'ACM-1', title: 'Checkout' },
      },
      {
        user: MEMBERS[1]?.user,
        title: 'Tester',
        openTasks: 0,
        inProgress: 0,
        dueToday: 0,
        delayed: 0,
        minutesToday: 0,
        currentTask: null,
      },
    ]);
  });

  it('asks nothing at all when nobody is in scope', async () => {
    const groupBy = jest.fn();
    const findMany = jest.fn();
    const prisma = {
      task: { groupBy, findMany },
      workLog: { groupBy: jest.fn() },
    } as unknown as PrismaService;
    await expect(buildOperationsTeam(queries(prisma), prisma, [])).resolves.toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('buildOperationsTime', () => {
  function timePrisma(finished: Array<{ dueAt: Date | null; completedAt: Date | null }>) {
    const { count, wheres } = countingTasks(1);
    const findMany = jest.fn(({ select }: { select?: unknown }) =>
      // The fold reads two columns; the card list is a full task summary. Only the fold is seeded.
      Promise.resolve(select ? finished : []),
    );
    const prisma = {
      task: { count, findMany, aggregate: jest.fn().mockResolvedValue({ _sum: {} }) },
      workLog: { aggregate: jest.fn().mockResolvedValue({ _sum: { minutes: 240 } }) },
    } as unknown as PrismaService;
    return { prisma, wheres };
  }

  it('buckets open work on the same boundaries computeTaskTiming uses', async () => {
    const { prisma, wheres } = timePrisma([]);
    await buildOperationsTime(queries(prisma), prisma, TEAM_SCOPE, NOW, true);

    const atRiskEdge = new Date(NOW.getTime() + AT_RISK_WINDOW_MINUTES * 60_000);
    const dueAtOf = (where: Prisma.TaskWhereInput) => where.dueAt;
    expect(wheres.map(dueAtOf)).toEqual([
      { lt: NOW },
      { gte: NOW, lte: atRiskEdge },
      { gt: atRiskEdge },
      null,
    ]);

    // The boundary is not merely the same number: a task one minute inside it is AT_RISK and one
    // minute outside is IN_HAND, which is what the second and third buckets select.
    const inside = new Date(atRiskEdge.getTime() - 60_000);
    const outside = new Date(atRiskEdge.getTime() + 60_000);
    const verdict = (dueAt: Date) =>
      computeTaskTiming({
        dueAt,
        completedAt: null,
        estimateMinutes: null,
        loggedMinutes: 0,
        now: NOW,
      }).status;
    expect(verdict(inside)).toBe(TASK_TIMING.AT_RISK);
    expect(verdict(outside)).toBe(TASK_TIMING.IN_HAND);
  });

  it('splits today’s completions with computeTaskTiming rather than with a second rule', async () => {
    const due = new Date('2026-09-16T09:00:00.000Z');
    const { prisma } = timePrisma([
      { dueAt: due, completedAt: new Date('2026-09-16T08:30:00.000Z') },
      { dueAt: due, completedAt: new Date('2026-09-16T09:30:00.000Z') },
      { dueAt: null, completedAt: new Date('2026-09-16T09:30:00.000Z') },
    ]);

    const time = await buildOperationsTime(queries(prisma), prisma, TEAM_SCOPE, NOW, true);

    expect(time).toMatchObject({
      completedOnTime: 1,
      completedLate: 1,
      completedUnscheduled: 1,
      estimateMinutes: 0,
      loggedMinutes: 240,
    });
  });
});

describe('buildOperationsAvailability', () => {
  const prismaWith = (over: Record<string, unknown>) =>
    ({
      userAvailability: { findMany: jest.fn().mockResolvedValue(over.availability ?? []) },
      userWorkSchedule: { findMany: jest.fn().mockResolvedValue(over.schedules ?? []) },
      onCallSchedule: { findMany: jest.fn().mockResolvedValue(over.onCall ?? []) },
    }) as unknown as PrismaService;

  it('lets an approved leave outrank a rota that says the person should be working', async () => {
    const prisma = prismaWith({
      availability: [{ userId: 'user-dev', status: AVAILABILITY_STATUS.ON_LEAVE, until: null }],
      schedules: [
        {
          userId: 'user-dev',
          workingDays: [0, 1, 2, 3, 4, 5, 6],
          startMinute: 0,
          endMinute: 1439,
          timezone: 'UTC',
        },
      ],
    });

    const [dev] = await buildOperationsAvailability(prisma, ORGANIZATION, TODAY, MEMBERS, [], NOW);

    expect(dev).toMatchObject({ status: AVAILABILITY_STATUS.ON_LEAVE, reason: 'ON_LEAVE' });
    expect(dev?.withinSchedule).toBe(true);
  });

  it('treats today’s backup as on call, which beats being outside their hours', async () => {
    const prisma = prismaWith({
      onCall: [{ userId: 'user-qa', backupUserId: 'user-dev' }],
      schedules: [
        { userId: 'user-dev', workingDays: [], startMinute: 0, endMinute: 0, timezone: 'UTC' },
      ],
    });

    const [dev] = await buildOperationsAvailability(prisma, ORGANIZATION, TODAY, MEMBERS, [], NOW);

    expect(dev).toMatchObject({ onCall: true, available: true });
  });
});

describe('buildOperationsSupport', () => {
  const supportPrisma = () =>
    ({
      ticket: { count: jest.fn().mockResolvedValue(2), findMany: jest.fn().mockResolvedValue([]) },
      supportOwnership: {
        findMany: jest.fn().mockResolvedValue([
          {
            autoRouteEnabled: true,
            ackMinutes: 15,
            escalationMinutes: 30,
            project: { id: 'project-a', code: 'ACM', name: 'Acme' },
            fallbackUser: null,
          },
        ]),
      },
    }) as unknown as PrismaService;

  it('omits the routing block entirely without support-routing:manage', async () => {
    const prisma = supportPrisma();
    const support = await buildOperationsSupport(queries(prisma), prisma, TEAM_SCOPE, false, NOW);

    expect(support).not.toHaveProperty('routing');
    expect(prisma.supportOwnership.findMany).not.toHaveBeenCalled();
    // The ticket counts themselves are not the guarded part and are still reported.
    expect(support.escalated).toBe(2);
  });

  it('includes the fallback owner for a caller who may manage routing', async () => {
    const prisma = supportPrisma();
    const support = await buildOperationsSupport(queries(prisma), prisma, TEAM_SCOPE, true, NOW);

    expect(support.routing).toEqual([
      {
        project: { id: 'project-a', code: 'ACM', name: 'Acme' },
        autoRouteEnabled: true,
        fallbackUser: null,
        ackMinutes: 15,
        escalationMinutes: 30,
      },
    ]);
  });
});

describe('buildOperationsRelease', () => {
  it('folds both pipelines out of two grouped queries', async () => {
    const prisma = {
      testingAssignment: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'PENDING', _count: { _all: 2 } },
          { status: 'CLARIFICATION', _count: { _all: 1 } },
          { status: 'FAILED', _count: { _all: 3 } },
          { status: 'PASSED', _count: { _all: 4 } },
        ]),
      },
      uatRequest: { count: jest.fn().mockResolvedValue(1) },
      release: {
        groupBy: jest.fn().mockResolvedValue([
          { status: RELEASE_STATUS.APPROVED, _count: { _all: 1 } },
          { status: RELEASE_STATUS.SCHEDULED, _count: { _all: 1 } },
          { status: RELEASE_STATUS.FAILED, _count: { _all: 2 } },
        ]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const release = await buildOperationsRelease(prisma, ORGANIZATION, TEAM_SCOPE);

    expect(release).toMatchObject({
      // A tester waiting on an answer is still QA that has not happened.
      qaWaiting: 3,
      qaFailed: 3,
      qaPassed: 4,
      uatPending: 1,
      blockers: 2,
      readyToRelease: 2,
    });
  });

  it('reaches a project-scoped caller’s UAT through the release or the task it hangs off', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      testingAssignment: { groupBy: jest.fn().mockResolvedValue([]) },
      uatRequest: { count },
      release: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    await buildOperationsRelease(prisma, ORGANIZATION, TEAM_SCOPE);

    expect(count).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION,
        deletedAt: null,
        status: 'PENDING',
        OR: [
          { release: { projectId: { in: ['project-a'] } } },
          { task: { projectId: { in: ['project-a'] } } },
        ],
      },
    });
  });
});
