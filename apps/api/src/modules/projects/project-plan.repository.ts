import { Injectable } from '@nestjs/common';
import { OPEN_TASK_STATUSES, TASK_STATUS } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const planMilestoneInclude = {
  owner: { select: { id: true, name: true, email: true } },
  deliverables: { select: { isDone: true } },
  dependsOn: { select: { dependsOnId: true } },
} satisfies Prisma.MilestoneInclude;

export type PlanMilestoneRow = Prisma.MilestoneGetPayload<{ include: typeof planMilestoneInclude }>;

/**
 * Task numbers for one grouping of a project's work: a milestone, or `null` for the tasks no
 * milestone claims. Cancelled tasks are excluded, the same way project progress excludes them.
 */
export interface PlanTaskGroup {
  milestoneId: string | null;
  total: number;
  completed: number;
  overdue: number;
  /** The span the work covers, so a milestone with no dates of its own can still be placed. */
  earliest: Date | null;
  latest: Date | null;
}

/** Today at UTC midnight — the grain `dueDate` is stored in. */
function todayDate(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

/**
 * Reads for the project plan. Deliberately aggregate-only for tasks: a plan shows how much work
 * sits under each milestone, never the tasks themselves, so three grouped queries answer it
 * whatever the size of the project.
 */
@Injectable()
export class ProjectPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  milestones(organizationId: string, projectId: string): Promise<PlanMilestoneRow[]> {
    return this.prisma.milestone.findMany({
      where: { organizationId, projectId, deletedAt: null },
      include: planMilestoneInclude,
      orderBy: [{ sortOrder: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async taskGroups(organizationId: string, projectId: string): Promise<PlanTaskGroup[]> {
    const today = todayDate();
    const scope = {
      organizationId,
      projectId,
      deletedAt: null,
      status: { not: TASK_STATUS.CANCELLED },
    } satisfies Prisma.TaskWhereInput;
    const [byStatus, overdue, span] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['milestoneId', 'status'],
        where: scope,
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['milestoneId'],
        where: { ...scope, dueDate: { lt: today }, status: { in: [...OPEN_TASK_STATUSES] } },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['milestoneId'],
        where: scope,
        _min: { scheduledStartAt: true, dueDate: true },
        _max: { dueDate: true, completedAt: true },
      }),
    ]);
    const groups = new Map<string | null, PlanTaskGroup>();
    const entry = (milestoneId: string | null): PlanTaskGroup => {
      let group = groups.get(milestoneId);
      if (!group) {
        group = { milestoneId, total: 0, completed: 0, overdue: 0, earliest: null, latest: null };
        groups.set(milestoneId, group);
      }
      return group;
    };
    for (const row of byStatus) {
      const group = entry(row.milestoneId);
      group.total += row._count._all;
      if (!OPEN_TASK_STATUSES.includes(row.status as never)) {
        group.completed += row._count._all;
      }
    }
    for (const row of overdue) {
      entry(row.milestoneId).overdue = row._count._all;
    }
    for (const row of span) {
      const group = entry(row.milestoneId);
      group.earliest = earliest([row._min.scheduledStartAt, row._min.dueDate]);
      group.latest = latest([row._max.dueDate, row._max.completedAt]);
    }
    return [...groups.values()];
  }
}

function earliest(values: Array<Date | null>): Date | null {
  return values.reduce<Date | null>(
    (found, value) => (value !== null && (found === null || value < found) ? value : found),
    null,
  );
}

function latest(values: Array<Date | null>): Date | null {
  return values.reduce<Date | null>(
    (found, value) => (value !== null && (found === null || value > found) ? value : found),
    null,
  );
}
