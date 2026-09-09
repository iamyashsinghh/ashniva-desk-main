import { Injectable } from '@nestjs/common';
import { TASK_STATUS } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, TaskStatus } from '../../generated/prisma/client';
import {
  overdueWhere,
  scheduledBetweenWhere,
  startedBetweenWhere,
  upcomingWhere,
} from './task-windows';

const userRef = { select: { id: true, name: true, email: true } } as const;

export const taskSummaryInclude = {
  project: {
    select: {
      id: true,
      code: true,
      name: true,
      clientOrganizationId: true,
      clientOrganization: { select: { id: true, name: true, slug: true } },
    },
  },
  category: { select: { id: true, name: true, kind: true } },
  assignedTo: userRef,
  createdBy: userRef,
  reviewer: userRef,
  tester: userRef,
  ticket: { select: { id: true, number: true, title: true } },
  milestone: { select: { id: true, name: true } },
  changeRequest: { select: { id: true, number: true, title: true } },
  workLogs: { select: { minutes: true } },
} satisfies Prisma.TaskInclude;

export const taskDetailInclude = {
  ...taskSummaryInclude,
  statusHistory: { include: { changedBy: userRef }, orderBy: { createdAt: 'asc' } },
  comments: {
    where: { deletedAt: null },
    include: { author: userRef },
    orderBy: { createdAt: 'asc' },
  },
  workLogs: {
    include: { user: userRef },
    orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
  },
  files: {
    where: { deletedAt: null },
    include: { uploadedBy: userRef },
    orderBy: { createdAt: 'asc' },
  },
  clientUpdates: {
    include: {
      author: userRef,
      publishedBy: userRef,
      project: { select: { id: true, code: true, name: true } },
      clientOrganization: { select: { id: true, name: true, slug: true } },
      ticket: { select: { id: true, number: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.TaskInclude;

export type TaskSummaryRow = Prisma.TaskGetPayload<{ include: typeof taskSummaryInclude }>;
export type TaskDetailRow = Prisma.TaskGetPayload<{ include: typeof taskDetailInclude }>;

export interface TaskListFilter {
  organizationId: string;
  /**
   * Who the caller may read at all, from `TaskVisibilityService`. Undefined means "everything in
   * the tenant", which is what an organization-wide reader gets — not what an absent scope means.
   * Every caller that builds a filter for a person passes it.
   */
  visibility?: Prisma.TaskWhereInput;
  status?: TaskStatus[];
  projectId?: string;
  assignedToId?: string;
  createdById?: string;
  /** Tasks whose assignee is one of these people (team view). */
  assigneeIds?: string[];
  /** Tasks awaiting this person's review (tester or reviewer). */
  reviewFor?: string;
  priority?: Prisma.TaskWhereInput['priority'];
  clientOrganizationId?: string;
  clientVisible?: boolean;
  search?: string;
  dueOn?: Date;
  /** Only work that is startable now: no scheduled start, or one that has already passed. */
  notScheduledAfter?: Date;
  /** Only work whose scheduled start is still ahead. */
  scheduledAfter?: Date;
  overdueAsOf?: Date;
  /** Only open work whose scheduled start falls on this day (`scheduledTo` is the day after). */
  scheduledFrom?: Date;
  scheduledTo?: Date;
  /** Only work actually begun in this window, whatever became of it since. */
  startedFrom?: Date;
  startedTo?: Date;
  /** Only open work whose scheduled start is still ahead of this instant. */
  upcomingAsOf?: Date;
  completedFrom?: Date;
  completedTo?: Date;
  limit: number;
  cursor?: string;
}

export interface TaskPage {
  items: TaskSummaryRow[];
  nextCursor: string | null;
  total: number;
}

/**
 * Every condition goes into `AND`, so filters combine instead of overwriting each other: two
 * clauses that both need `status` (an explicit status list and "overdue") or both need `OR`
 * (awaiting-my-review and free-text search) would silently lose one half in a flat object.
 */
export function buildTaskWhere(filter: TaskListFilter): Prisma.TaskWhereInput {
  const search = filter.search?.trim();
  const and: Prisma.TaskWhereInput[] = [];
  // First, and in `AND` like everything else: the view a caller asks for narrows what they may
  // see, it never widens it. `view=all` used to return the organization because the scope was the
  // tenant and nothing else.
  if (filter.visibility) {
    and.push(filter.visibility);
  }
  if (filter.status?.length) {
    and.push({ status: { in: filter.status } });
  }
  if (filter.projectId) {
    and.push({ projectId: filter.projectId });
  }
  if (filter.assignedToId) {
    and.push({ assignedToId: filter.assignedToId });
  }
  if (filter.createdById) {
    and.push({ createdById: filter.createdById });
  }
  if (filter.assigneeIds) {
    and.push({ assignedToId: { in: filter.assigneeIds } });
  }
  if (filter.reviewFor) {
    and.push({ OR: [{ testerId: filter.reviewFor }, { reviewerId: filter.reviewFor }] });
  }
  if (filter.priority) {
    and.push({ priority: filter.priority });
  }
  if (filter.clientOrganizationId) {
    and.push({ project: { clientOrganizationId: filter.clientOrganizationId } });
  }
  if (filter.clientVisible !== undefined) {
    and.push({ clientVisible: filter.clientVisible });
  }
  if (filter.dueOn) {
    and.push({ dueDate: filter.dueOn });
  }
  if (filter.notScheduledAfter) {
    and.push({
      OR: [{ scheduledStartAt: null }, { scheduledStartAt: { lte: filter.notScheduledAfter } }],
    });
  }
  if (filter.scheduledAfter) {
    and.push({ scheduledStartAt: { gt: filter.scheduledAfter } });
  }
  if (filter.overdueAsOf) {
    and.push(overdueWhere(filter.overdueAsOf));
  }
  if (filter.scheduledFrom && filter.scheduledTo) {
    and.push(scheduledBetweenWhere(filter.scheduledFrom, filter.scheduledTo));
  }
  if (filter.startedFrom && filter.startedTo) {
    and.push(startedBetweenWhere(filter.startedFrom, filter.startedTo));
  }
  if (filter.upcomingAsOf) {
    and.push(upcomingWhere(filter.upcomingAsOf));
  }
  if (filter.completedFrom || filter.completedTo) {
    // Completed within the window, and actually completed: a task finished today and then
    // reopened keeps its completedAt but is no longer a completion.
    and.push({
      completedAt: { gte: filter.completedFrom, lt: filter.completedTo },
      status: TASK_STATUS.COMPLETED,
    });
  }
  if (search) {
    and.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { module: { contains: search, mode: 'insensitive' } },
      ],
    });
  }
  return {
    organizationId: filter.organizationId,
    deletedAt: null,
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/**
 * Task data access. Every query carries organizationId; client-portal reads additionally pass
 * clientOrganizationId + clientVisible so a client only ever sees its own visible work.
 */
@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: TaskListFilter): Promise<TaskPage> {
    const where = buildTaskWhere(filter);
    const [total, rows] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        include: taskSummaryInclude,
        orderBy: [
          { dueDate: { sort: 'asc', nulls: 'last' } },
          { priority: 'desc' },
          { id: 'desc' },
        ],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  countByStatus(where: Prisma.TaskWhereInput) {
    return this.prisma.task.groupBy({ by: ['status'], where, _count: { _all: true } });
  }

  /**
   * `visibility` is part of the `where`, not a check on the row afterwards: a task outside the
   * caller's scope has to be indistinguishable from one that does not exist, and a fetch-then-test
   * leaks the difference the first time somebody logs what it found.
   */
  findDetail(
    organizationId: string,
    id: string,
    visibility?: Prisma.TaskWhereInput,
  ): Promise<TaskDetailRow | null> {
    return this.prisma.task.findFirst({
      where: { id, organizationId, deletedAt: null, ...(visibility ? { AND: visibility } : {}) },
      include: taskDetailInclude,
    });
  }

  findSummary(
    organizationId: string,
    id: string,
    visibility?: Prisma.TaskWhereInput,
  ): Promise<TaskSummaryRow | null> {
    return this.prisma.task.findFirst({
      where: { id, organizationId, deletedAt: null, ...(visibility ? { AND: visibility } : {}) },
      include: taskSummaryInclude,
    });
  }

  /** Creates the task and its first history row under a fresh per-organization number. */
  create(
    organizationId: string,
    data: Omit<Prisma.TaskUncheckedCreateInput, 'organizationId' | 'number'>,
    historyNote?: string,
  ): Promise<TaskSummaryRow> {
    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.organizationCounter.upsert({
        where: { organizationId_kind: { organizationId, kind: 'TASK' } },
        update: { value: { increment: 1 } },
        create: { organizationId, kind: 'TASK', value: 1 },
      });
      return tx.task.create({
        data: {
          ...data,
          organizationId,
          number: counter.value,
          statusHistory: {
            create: {
              toStatus: data.status ?? TASK_STATUS.ASSIGNED,
              changedById: data.createdById,
              note: historyNote,
            },
          },
        },
        include: taskSummaryInclude,
      });
    });
  }

  /**
   * `organizationId` is in the `where`, not merely checked by whoever read the row first: a scoped
   * read followed by an unscoped update by id writes across tenants the first time somebody
   * refactors the read away.
   */
  update(
    organizationId: string,
    id: string,
    data: Prisma.TaskUncheckedUpdateInput,
  ): Promise<TaskSummaryRow> {
    return this.prisma.task.update({
      where: { id, organizationId },
      data,
      include: taskSummaryInclude,
    });
  }

  /** Status change + history row in one transaction, plus any extra writes the caller needs. */
  transition(
    organizationId: string,
    id: string,
    from: TaskStatus,
    to: TaskStatus,
    changedById: string,
    note: string | null,
    data: Prisma.TaskUncheckedUpdateInput = {},
    extra?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<TaskSummaryRow> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id, organizationId },
        data: {
          ...data,
          status: to,
          statusHistory: { create: { fromStatus: from, toStatus: to, changedById, note } },
        },
        include: taskSummaryInclude,
      });
      if (extra) {
        await extra(tx);
      }
      return task;
    });
  }

  listHistory(taskId: string) {
    return this.prisma.taskStatusHistory.findMany({
      where: { taskId },
      include: { changedBy: userRef },
      orderBy: { createdAt: 'asc' },
    });
  }
}
