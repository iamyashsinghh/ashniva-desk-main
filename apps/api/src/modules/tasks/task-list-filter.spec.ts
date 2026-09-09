import { TASK_LIST_VIEW, TASK_STATUS, type AuthenticatedUser } from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { buildTaskListFilter, openStatuses } from './task-list-filter';
import { buildTaskWhere } from './tasks.repository';

const ACTOR: AuthenticatedUser = {
  userId: 'user-lead',
  organizationId: 'org-ashniva',
  roleKey: 'TEAM_LEAD',
  permissions: [],
} as unknown as AuthenticatedUser;

/** Only the team view touches the database, and only to expand the team. */
const prisma = {
  team: { findMany: jest.fn().mockResolvedValue([{ members: [{ userId: 'user-dev' }] }]) },
} as unknown as PrismaService;

/** A stand-in for whatever `TaskVisibilityService` resolved for this caller. */
const SCOPE: Prisma.TaskWhereInput = { OR: [{ assignedToId: { in: ['user-lead'] } }] };

const query = (overrides: Partial<ListTasksQueryDto> = {}): ListTasksQueryDto =>
  ({ limit: 50, ...overrides }) as ListTasksQueryDto;

const midnightUtc = new Date(new Date().toISOString().slice(0, 10));

describe('buildTaskListFilter', () => {
  describe('the caller’s scope', () => {
    // The defect this file used to assert as correct behaviour: `view=all` returned the
    // organization, so any internal user could list every other person's work. A view now says
    // which slice of what the caller may see they are looking at; it never widens it.
    it('carries the scope into the all view rather than returning the organization', async () => {
      const filter = await buildTaskListFilter(
        prisma,
        ACTOR,
        query({ view: TASK_LIST_VIEW.ALL }),
        SCOPE,
      );
      expect(filter.visibility).toBe(SCOPE);
      expect(filter.organizationId).toBe('org-ashniva');
    });

    it.each(Object.values(TASK_LIST_VIEW))('carries the scope into the %s view', async (view) => {
      const filter = await buildTaskListFilter(prisma, ACTOR, query({ view }), SCOPE);
      expect(filter.visibility).toBe(SCOPE);
    });

    // Undefined is the organization-wide reader's answer, and it is the only way to get one.
    it('leaves the scope absent for a caller who may read the whole organization', async () => {
      const filter = await buildTaskListFilter(prisma, ACTOR, query({ view: TASK_LIST_VIEW.ALL }));
      expect(filter.visibility).toBeUndefined();
    });
  });

  describe('the overdue filter', () => {
    // Regression: the management dashboard counts every overdue task in the organization and
    // links to the task list. While "overdue" was a view that forced assignedToId to the caller,
    // that list came back empty for anyone who had no overdue task of their own.
    it('narrows the all view without pinning the list to the caller', async () => {
      const filter = await buildTaskListFilter(
        prisma,
        ACTOR,
        query({ view: TASK_LIST_VIEW.ALL, overdue: true }),
        SCOPE,
      );
      expect(filter.overdueAsOf).toEqual(midnightUtc);
      expect(filter.assignedToId).toBeUndefined();
      expect(filter.assigneeIds).toBeUndefined();
      // Not pinned to the caller, and not the organization either: the scope is what bounds it.
      expect(filter.visibility).toBe(SCOPE);
    });

    it('narrows the team view to the same people the team view already selects', async () => {
      const filter = await buildTaskListFilter(
        prisma,
        ACTOR,
        query({ view: TASK_LIST_VIEW.TEAM, overdue: true }),
      );
      expect(filter.overdueAsOf).toEqual(midnightUtc);
      expect(filter.assigneeIds).toEqual(expect.arrayContaining(['user-lead', 'user-dev']));
    });

    it('narrows the my view to the caller', async () => {
      const filter = await buildTaskListFilter(
        prisma,
        ACTOR,
        query({ view: TASK_LIST_VIEW.MY, overdue: true }),
      );
      expect(filter).toMatchObject({ assignedToId: 'user-lead', overdueAsOf: midnightUtc });
    });

    it('is off unless asked for', async () => {
      const filter = await buildTaskListFilter(prisma, ACTOR, query({ view: TASK_LIST_VIEW.ALL }));
      expect(filter.overdueAsOf).toBeUndefined();
    });

    it('keeps the overdue view as the caller’s own overdue work', async () => {
      const filter = await buildTaskListFilter(
        prisma,
        ACTOR,
        query({ view: TASK_LIST_VIEW.OVERDUE }),
      );
      expect(filter).toMatchObject({ assignedToId: 'user-lead', overdueAsOf: midnightUtc });
    });
  });

  it('bounds the completed-today filter to one server day', async () => {
    const filter = await buildTaskListFilter(
      prisma,
      ACTOR,
      query({ view: TASK_LIST_VIEW.DONE, completedToday: true }),
    );
    expect(filter.completedFrom).toEqual(midnightUtc);
    expect(filter.completedTo).toEqual(new Date(midnightUtc.getTime() + 86_400_000));
    expect(filter.status).toEqual([TASK_STATUS.COMPLETED]);
  });

  it('leaves closed statuses out of every open view', () => {
    expect(openStatuses()).not.toContain(TASK_STATUS.COMPLETED);
    expect(openStatuses()).not.toContain(TASK_STATUS.CANCELLED);
  });
});

describe('buildTaskWhere', () => {
  const base = { organizationId: 'org-ashniva', limit: 50 };

  it('excludes completed and cancelled tasks from an overdue query', () => {
    const where = buildTaskWhere({ ...base, overdueAsOf: midnightUtc });
    const overdue = (where.AND as Record<string, unknown>[]).find((clause) => 'dueDate' in clause);
    expect(overdue?.status).toEqual({
      in: expect.not.arrayContaining([TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED]),
    });
    expect(overdue?.dueDate).toEqual({ lt: midnightUtc });
  });

  // Both of these clauses need the same key. Spread into one object, the later one won.
  it('keeps an explicit status filter alongside the overdue filter', () => {
    const where = buildTaskWhere({
      ...base,
      status: [TASK_STATUS.BLOCKED],
      overdueAsOf: midnightUtc,
    });
    const clauses = where.AND as Record<string, unknown>[];
    expect(clauses).toContainEqual({ status: { in: [TASK_STATUS.BLOCKED] } });
    expect(clauses.some((clause) => 'dueDate' in clause)).toBe(true);
  });

  it('keeps the awaiting-review clause alongside a search', () => {
    const where = buildTaskWhere({ ...base, reviewFor: 'user-lead', search: 'checkout' });
    const clauses = where.AND as Record<string, unknown>[];
    expect(clauses.filter((clause) => 'OR' in clause)).toHaveLength(2);
  });

  it('always scopes to the organization and skips deleted rows', () => {
    const where = buildTaskWhere(base);
    expect(where).toMatchObject({ organizationId: 'org-ashniva', deletedAt: null });
  });

  describe('the visibility scope', () => {
    it('is an AND clause, so a view’s own OR cannot displace it', () => {
      const where = buildTaskWhere({ ...base, visibility: SCOPE, reviewFor: 'user-lead' });
      const clauses = where.AND as Record<string, unknown>[];
      expect(clauses).toContainEqual(SCOPE);
      expect(clauses).toContainEqual({
        OR: [{ testerId: 'user-lead' }, { reviewerId: 'user-lead' }],
      });
    });

    it('leaves the query unnarrowed when the caller may read the organization', () => {
      const where = buildTaskWhere(base);
      expect(where.AND).toBeUndefined();
    });
  });
});
