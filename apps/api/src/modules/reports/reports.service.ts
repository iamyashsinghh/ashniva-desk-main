import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser, DailyReportResponse, DailyReportSnapshot } from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { WorkLogsService } from '../work-logs/work-logs.service';
import { buildDailyReportSnapshot, toReportDate } from './daily-report-builder';
import { collectDailyReportInput, refreshDailyReport } from './daily-report-collector';

/**
 * Daily reports are computed, never typed: work logs + task completions of the day. `daily`
 * always computes live (and stores the result); `history` reads stored snapshots.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workLogs: WorkLogsService,
  ) {}

  async daily(
    actor: AuthenticatedUser,
    date?: string,
    userId?: string,
  ): Promise<DailyReportResponse> {
    this.assertInternal(actor);
    const targetUserId = userId ?? actor.userId;
    await this.workLogs.visibleUserIds(actor, targetUserId);
    const reportDate = date ?? toReportDate(new Date());
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const stored = await refreshDailyReport(
      this.prisma,
      actor.organizationId,
      targetUserId,
      reportDate,
    );
    return {
      userId: user.id,
      userName: user.name,
      reportDate,
      generatedAt: stored.generatedAt.toISOString(),
      snapshot: stored.snapshot as unknown as DailyReportSnapshot,
    };
  }

  /** One live report per person the caller may see (team lead → team, manager → everyone). */
  async team(actor: AuthenticatedUser, date?: string): Promise<DailyReportResponse[]> {
    this.assertInternal(actor);
    const reportDate = date ?? toReportDate(new Date());
    const visible = await this.workLogs.visibleUserIds(actor);
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(visible ? { id: { in: visible } } : {}),
        memberships: {
          some: {
            organizationId: actor.organizationId,
            deletedAt: null,
            role: {
              key: {
                in: ['DEVELOPER', 'TESTER', 'TEAM_LEAD', 'SUPPORT_EXECUTIVE', 'PROJECT_MANAGER'],
              },
            },
          },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const reports = await Promise.all(
      users.map(async (user) => {
        const input = await collectDailyReportInput(
          this.prisma,
          actor.organizationId,
          user.id,
          reportDate,
        );
        return {
          userId: user.id,
          userName: user.name,
          reportDate,
          generatedAt: new Date().toISOString(),
          snapshot: buildDailyReportSnapshot(input),
        };
      }),
    );
    return reports.filter((report) => report.snapshot.tasksWorkedOn > 0 || visible?.length === 1);
  }

  async history(
    actor: AuthenticatedUser,
    userId: string | undefined,
    from: string,
    to: string,
  ): Promise<DailyReportResponse[]> {
    this.assertInternal(actor);
    const targetUserId = userId ?? actor.userId;
    await this.workLogs.visibleUserIds(actor, targetUserId);
    const rows = await this.prisma.dailyReport.findMany({
      where: {
        organizationId: actor.organizationId,
        userId: targetUserId,
        reportDate: { gte: new Date(from), lte: new Date(to) },
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { reportDate: 'desc' },
      take: 62,
    });
    return rows.map((row) => ({
      userId: row.user.id,
      userName: row.user.name,
      reportDate: toReportDate(row.reportDate),
      generatedAt: row.generatedAt.toISOString(),
      snapshot: row.snapshot as unknown as DailyReportSnapshot,
    }));
  }

  /** Nightly job: store today's snapshot for every internal person with activity. */
  async snapshotEveryone(organizationId: string, reportDate: string): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, memberships: { some: { organizationId, deletedAt: null } } },
      select: { id: true },
    });
    let stored = 0;
    for (const user of users) {
      const input = await collectDailyReportInput(this.prisma, organizationId, user.id, reportDate);
      if (input.workLogs.length > 0 || input.tasks.length > 0) {
        await refreshDailyReport(this.prisma, organizationId, user.id, reportDate);
        stored += 1;
      }
    }
    return stored;
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Reports are internal');
    }
  }
}
