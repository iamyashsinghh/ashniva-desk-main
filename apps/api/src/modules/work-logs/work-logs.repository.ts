import { Injectable } from '@nestjs/common';
import { MAX_UNPAGINATED_ITEMS } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const workLogInclude = {
  user: { select: { id: true, name: true, email: true } },
  task: {
    select: {
      id: true,
      number: true,
      title: true,
      project: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.WorkLogInclude;

export type WorkLogRow = Prisma.WorkLogGetPayload<{ include: typeof workLogInclude }>;

export interface WorkLogFilter {
  organizationId: string;
  userIds?: string[];
  taskId?: string;
  projectId?: string;
  from?: Date;
  to?: Date;
}

export interface CreateWorkLogInput {
  organizationId: string;
  taskId: string;
  userId: string;
  workDate: Date;
  minutes: number;
  summary: string;
  proofUrl?: string | null;
  gitRef?: string | null;
}

@Injectable()
export class WorkLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    input: CreateWorkLogInput,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<WorkLogRow> {
    return tx.workLog.create({ data: input, include: workLogInclude });
  }

  list(filter: WorkLogFilter): Promise<WorkLogRow[]> {
    return this.prisma.workLog.findMany({
      where: {
        organizationId: filter.organizationId,
        ...(filter.userIds ? { userId: { in: filter.userIds } } : {}),
        ...(filter.taskId ? { taskId: filter.taskId } : {}),
        ...(filter.projectId ? { task: { projectId: filter.projectId } } : {}),
        ...(filter.from || filter.to ? { workDate: { gte: filter.from, lte: filter.to } } : {}),
      },
      include: workLogInclude,
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      take: MAX_UNPAGINATED_ITEMS,
    });
  }

  /** Minutes per user for a date range (team workload, dashboards). */
  minutesByUser(organizationId: string, from: Date, to: Date, userIds?: string[]) {
    return this.prisma.workLog.groupBy({
      by: ['userId'],
      where: {
        organizationId,
        workDate: { gte: from, lte: to },
        ...(userIds ? { userId: { in: userIds } } : {}),
      },
      _sum: { minutes: true },
    });
  }
}
