import { Injectable } from '@nestjs/common';
import { OPEN_TASK_STATUSES, TASK_STATUS } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type {
  MilestoneHistoryKind,
  MilestoneStatus,
  Prisma,
  PrismaClient,
} from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

export const milestoneSummaryInclude = {
  project: { select: { id: true, code: true, name: true, clientOrganizationId: true } },
  contract: { select: { id: true, numberLabel: true, title: true } },
  owner: userRef,
  deliverables: { select: { id: true, title: true, isDone: true }, orderBy: { sortOrder: 'asc' } },
  tasks: { where: { deletedAt: null }, select: { id: true, status: true } },
} satisfies Prisma.MilestoneInclude;

export const milestoneDetailInclude = {
  ...milestoneSummaryInclude,
  deliverables: { orderBy: { sortOrder: 'asc' } },
  dependsOn: { include: { dependsOn: { select: { id: true, name: true } } } },
  dependents: { include: { milestone: { select: { id: true, name: true } } } },
  history: { include: { changedBy: userRef }, orderBy: { createdAt: 'asc' } },
  tasks: {
    where: { deletedAt: null },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      project: { select: { code: true } },
    },
    orderBy: { number: 'asc' },
  },
  changeRequest: { select: { id: true, number: true, title: true } },
  createdBy: userRef,
} satisfies Prisma.MilestoneInclude;

export type MilestoneSummaryRow = Prisma.MilestoneGetPayload<{
  include: typeof milestoneSummaryInclude;
}>;
export type MilestoneDetailRow = Prisma.MilestoneGetPayload<{
  include: typeof milestoneDetailInclude;
}>;

export interface MilestoneListFilter {
  organizationId: string;
  projectId?: string;
  contractId?: string;
  clientOrganizationId?: string;
  clientVisibleOnly?: boolean;
  status?: MilestoneStatus[];
  ownerUserId?: string;
  dueBefore?: Date;
}

type Db = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class MilestonesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: MilestoneListFilter): Promise<MilestoneSummaryRow[]> {
    return this.prisma.milestone.findMany({
      where: {
        organizationId: filter.organizationId,
        deletedAt: null,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.contractId ? { contractId: filter.contractId } : {}),
        ...(filter.clientOrganizationId
          ? { project: { clientOrganizationId: filter.clientOrganizationId } }
          : {}),
        ...(filter.clientVisibleOnly ? { clientVisible: true } : {}),
        ...(filter.status ? { status: { in: filter.status } } : {}),
        ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
        ...(filter.dueBefore ? { dueDate: { lte: filter.dueBefore } } : {}),
      },
      include: milestoneSummaryInclude,
      orderBy: [{ projectId: 'asc' }, { sortOrder: 'asc' }, { dueDate: 'asc' }],
    });
  }

  findSummary(organizationId: string, id: string): Promise<MilestoneSummaryRow | null> {
    return this.prisma.milestone.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: milestoneSummaryInclude,
    });
  }

  findDetail(organizationId: string, id: string): Promise<MilestoneDetailRow | null> {
    return this.prisma.milestone.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: milestoneDetailInclude,
    });
  }

  create(
    data: Prisma.MilestoneUncheckedCreateInput,
    db: Db = this.prisma,
  ): Promise<MilestoneDetailRow> {
    return db.milestone.create({ data, include: milestoneDetailInclude });
  }

  update(id: string, data: Prisma.MilestoneUncheckedUpdateInput, db: Db = this.prisma) {
    return db.milestone.update({ where: { id }, data, include: milestoneDetailInclude });
  }

  addHistory(
    input: {
      milestoneId: string;
      kind: MilestoneHistoryKind;
      fromValue?: string | null;
      toValue?: string | null;
      reason?: string | null;
      changedById: string;
    },
    db: Db = this.prisma,
  ) {
    return db.milestoneHistory.create({ data: input });
  }

  async replaceDeliverables(
    milestoneId: string,
    items: Array<{ id?: string; title: string; description?: string | null; isDone?: boolean }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.milestoneDeliverable.findMany({ where: { milestoneId } });
      const keep = new Set(items.map((item) => item.id).filter(Boolean));
      await tx.milestoneDeliverable.deleteMany({
        where: { milestoneId, id: { notIn: [...keep] as string[] } },
      });
      for (const [index, item] of items.entries()) {
        const previous = existing.find((row) => row.id === item.id);
        const isDone = item.isDone ?? previous?.isDone ?? false;
        const doneAt = isDone ? (previous?.doneAt ?? new Date()) : null;
        if (previous) {
          await tx.milestoneDeliverable.update({
            where: { id: previous.id },
            data: {
              title: item.title,
              description: item.description ?? null,
              isDone,
              doneAt,
              sortOrder: index,
            },
          });
        } else {
          await tx.milestoneDeliverable.create({
            data: {
              milestoneId,
              title: item.title,
              description: item.description ?? null,
              isDone,
              doneAt,
              sortOrder: index,
            },
          });
        }
      }
    });
  }

  setDeliverableDone(milestoneId: string, deliverableId: string, isDone: boolean) {
    return this.prisma.milestoneDeliverable.update({
      where: { id: deliverableId, milestoneId },
      data: { isDone, doneAt: isDone ? new Date() : null },
    });
  }

  async replaceDependencies(milestoneId: string, dependsOnIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.milestoneDependency.deleteMany({ where: { milestoneId } });
      if (dependsOnIds.length > 0) {
        await tx.milestoneDependency.createMany({
          data: dependsOnIds.map((dependsOnId) => ({ milestoneId, dependsOnId })),
        });
      }
    });
  }

  /** All dependency edges of one project, for cycle detection. */
  edgesForProject(projectId: string) {
    return this.prisma.milestoneDependency.findMany({
      where: { milestone: { projectId, deletedAt: null } },
      select: { milestoneId: true, dependsOnId: true },
    });
  }

  /** Progress inputs: tasks (completed / total non-cancelled) and deliverables. */
  async progressInputs(milestoneId: string, db: Db = this.prisma) {
    const [tasks, deliverables] = await Promise.all([
      db.task.findMany({
        where: { milestoneId, deletedAt: null, status: { not: TASK_STATUS.CANCELLED } },
        select: { status: true },
      }),
      db.milestoneDeliverable.findMany({ where: { milestoneId }, select: { isDone: true } }),
    ]);
    return {
      taskTotal: tasks.length,
      taskDone: tasks.filter((task) => !OPEN_TASK_STATUSES.includes(task.status as never)).length,
      deliverableTotal: deliverables.length,
      deliverableDone: deliverables.filter((item) => item.isDone).length,
    };
  }

  /** Status of the latest approval request per milestone (portal + summary). */
  async latestApprovalStatusMap(milestoneIds: string[]): Promise<Map<string, string>> {
    const latest = new Map<string, string>();
    if (milestoneIds.length === 0) {
      return latest;
    }
    const rows = await this.prisma.approvalRequest.findMany({
      where: { subjectType: 'MILESTONE', subjectId: { in: milestoneIds }, deletedAt: null },
      select: { subjectId: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    for (const row of rows) {
      if (!latest.has(row.subjectId)) {
        latest.set(row.subjectId, row.status);
      }
    }
    return latest;
  }
}
