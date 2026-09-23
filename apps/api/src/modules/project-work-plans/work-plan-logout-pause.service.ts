import { Injectable, Logger } from '@nestjs/common';
import {
  WORK_PLAN_EVENT_KIND,
  WORK_PLAN_POINT_STATUS,
  elapsedSeconds,
  extraThisRunSeconds,
  remainingSeconds,
} from '@ashniva/types';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';

/**
 * Freezes in-progress work-plan timers when a developer logs out.
 * Kept separate from WorkPlanService so Auth can call it without a circular module graph.
 */
@Injectable()
export class WorkPlanLogoutPauseService {
  private readonly logger = new Logger(WorkPlanLogoutPauseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async pauseRunningTimers(userId: string, organizationId?: string): Promise<number> {
    // Logout may run with a partial tenant stamp; system context lets RLS see the rows.
    return this.tenantContext.runAsSystem(() => this.pause(userId, organizationId));
  }

  private async pause(userId: string, organizationId?: string): Promise<number> {
    const now = new Date();
    const running = await this.prisma.projectWorkPlanPoint.findMany({
      where: {
        status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
        startedById: userId,
        pausedRemainingSeconds: null,
        ...(organizationId
          ? {
              title: {
                phase: {
                  plan: { organizationId },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        dueAt: true,
        startedAt: true,
        completedAt: true,
        pausedRemainingSeconds: true,
        overrunSeconds: true,
        title: {
          select: {
            phase: {
              select: {
                plan: { select: { organizationId: true } },
              },
            },
          },
        },
      },
    });
    if (running.length === 0) {
      this.logger.log(
        `No running work-plan timers to pause on logout for user ${userId}` +
          (organizationId ? ` (org ${organizationId})` : ''),
      );
      return 0;
    }
    await this.prisma.$transaction(async (tx) => {
      for (const point of running) {
        const remaining = remainingSeconds(
          point.dueAt,
          now,
          point.completedAt,
          point.pausedRemainingSeconds,
        );
        const overrunSeconds =
          point.overrunSeconds + extraThisRunSeconds(point.dueAt, now, remaining, null);
        await tx.projectWorkPlanPoint.update({
          where: { id: point.id },
          data: {
            pausedRemainingSeconds: remaining,
            overrunSeconds,
          },
        });
        await tx.projectWorkPlanEvent.create({
          data: {
            organizationId: point.title.phase.plan.organizationId,
            pointId: point.id,
            actorId: userId,
            kind: WORK_PLAN_EVENT_KIND.STOPPED,
            body: 'Stopped on logout',
            elapsedSeconds: elapsedSeconds(point.startedAt, now),
            extraSeconds: overrunSeconds,
          },
        });
      }
    });
    this.logger.log(`Paused ${running.length} work-plan timer(s) for user ${userId} on logout`);
    return running.length;
  }
}
