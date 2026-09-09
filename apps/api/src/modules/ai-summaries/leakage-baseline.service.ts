import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { CollectionScope } from './ai-source-collector.service';

const TAKE = 200;

/**
 * The internal material a client-facing summary is asserted *not* to contain.
 *
 * Read separately from the collector and never put in a prompt. Keeping it in its own file is
 * the point: the collector gathers what goes in, this gathers what must stay out, and confusing
 * the two would be the one mistake that matters.
 */
@Injectable()
export class LeakageBaselineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Internal text from the same period, for the leakage check.
   *
   * Read separately from `collect` and never put in a prompt: this is the material a client-facing
   * summary is asserted *not* to contain. Reading it here rather than reusing the collector makes
   * that difference explicit.
   */
  async internalTextsFor(scope: CollectionScope): Promise<string[]> {
    const [logs, changes] = await Promise.all([
      this.prisma.workLog.findMany({
        where: {
          organizationId: scope.organizationId,
          workDate: window(scope),
          ...(scope.projectId ? { task: { projectId: scope.projectId } } : {}),
        },
        select: { summary: true },
        take: TAKE,
      }),
      this.prisma.taskStatusHistory.findMany({
        where: {
          createdAt: window(scope),
          note: { not: null },
          task: {
            organizationId: scope.organizationId,
            deletedAt: null,
            ...(scope.projectId ? { projectId: scope.projectId } : {}),
          },
        },
        select: { note: true },
        take: TAKE,
      }),
    ]);

    return [...logs.map((row) => row.summary), ...changes.map((row) => row.note ?? '')].filter(
      (text) => text.trim().length > 0,
    );
  }

  /** Other clients in the tenant, so a weekly summary can be checked for naming one of them. */
  async otherClientNames(organizationId: string, clientOrganizationId: string | null) {
    const rows = await this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        isServiceProvider: false,
        id: { not: clientOrganizationId ?? organizationId },
      },
      select: { name: true },
      take: TAKE,
    });
    return rows.map((row) => row.name);
  }
}

function window(scope: CollectionScope) {
  return { gte: scope.periodStart, lt: scope.periodEnd };
}
