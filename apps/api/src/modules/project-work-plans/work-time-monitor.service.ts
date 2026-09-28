import { Injectable } from '@nestjs/common';
import {
  NOTIFICATION_TYPE,
  OPEN_TASK_STATUSES,
  ROLE_KEYS,
  WORK_PLAN_POINT_STATUS,
} from '@ashniva/types';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import {
  NotificationRecipientsService,
  type Recipient,
} from '../notifications/recipients.service';

export interface WorkTimeMonitorResult {
  workPlanPoints: number;
  tasks: number;
  notified: number;
}

const BATCH = 200;

/**
 * Watches started work that has run past its allotted time and alerts the project manager and
 * Super Admins. Runs every couple of minutes (see WorkTimeMonitorProcessor). Dedupe keys keep
 * re-runs from spamming the same overrun.
 */
@Injectable()
export class WorkTimeMonitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  run(now = new Date()): Promise<WorkTimeMonitorResult> {
    return this.tenantContext.runAsSystem(() => this.scan(now));
  }

  private async scan(now: Date): Promise<WorkTimeMonitorResult> {
    const result: WorkTimeMonitorResult = { workPlanPoints: 0, tasks: 0, notified: 0 };
    result.notified += await this.scanWorkPlanPoints(now, result);
    result.notified += await this.scanTasks(now, result);
    return result;
  }

  private async scanWorkPlanPoints(
    now: Date,
    result: WorkTimeMonitorResult,
  ): Promise<number> {
    const points = await this.prisma.projectWorkPlanPoint.findMany({
      where: {
        status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
        startedAt: { not: null },
        dueAt: { lte: now },
        pausedRemainingSeconds: null,
        completedAt: null,
      },
      take: BATCH,
      orderBy: { dueAt: 'asc' },
      include: {
        startedBy: { select: { id: true, name: true } },
        title: {
          select: {
            title: true,
            phase: {
              select: {
                heading: true,
                plan: {
                  select: {
                    project: {
                      select: {
                        id: true,
                        code: true,
                        name: true,
                        organizationId: true,
                        managerUserId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    result.workPlanPoints = points.length;
    let notified = 0;
    for (const point of points) {
      const project = point.title.phase.plan.project;
      const worker = point.startedBy?.name ?? 'Someone';
      const overdueBy = formatDuration(
        Math.max(0, Math.floor((now.getTime() - (point.dueAt?.getTime() ?? now.getTime())) / 1000)),
      );
      const body = [
        `${worker} is past the allotted ${point.estimateMinutes} min on`,
        `"${truncate(point.body)}" (${point.title.phase.heading} / ${point.title.title})`,
        `on ${project.code}. Over by ${overdueBy}.`,
      ].join(' ');
      const recipients = await this.managerRecipients(
        project.organizationId,
        project.managerUserId,
      );
      const sent = await this.dispatcher.notify({
        type: NOTIFICATION_TYPE.WORK_PLAN_TIME_EXCEEDED,
        title: `Time exceeded on ${project.code}`,
        body,
        link: `/projects/${project.id}`,
        entityType: 'work_plan_point',
        entityId: point.id,
        dedupeKey: `work-plan-time-exceeded:${point.id}`,
        recipients,
        excludeUserId: point.startedById,
      });
      notified += sent.created;
    }
    return notified;
  }

  private async scanTasks(now: Date, result: WorkTimeMonitorResult): Promise<number> {
    // Wall-clock allotment from Start: estimateMinutes after startedAt. Calendar TASK_OVERDUE
    // stays the daily assignee nudge; this is the live "they started and ran long" path.
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        startedAt: { not: null },
        estimateMinutes: { not: null, gt: 0 },
        status: { in: [...OPEN_TASK_STATUSES] },
        completedAt: null,
      },
      take: BATCH * 2,
      orderBy: { startedAt: 'asc' },
      include: {
        assignedTo: { select: { id: true, name: true } },
        project: {
          select: {
            id: true,
            code: true,
            organizationId: true,
            managerUserId: true,
          },
        },
      },
    });

    const overdue = tasks.filter((task) => {
      if (!task.startedAt || !task.estimateMinutes) {
        return false;
      }
      const dueAt = task.startedAt.getTime() + task.estimateMinutes * 60_000;
      return dueAt <= now.getTime();
    });
    result.tasks = overdue.length;
    let notified = 0;
    for (const task of overdue.slice(0, BATCH)) {
      const dueAt = task.startedAt!.getTime() + task.estimateMinutes! * 60_000;
      const overdueBy = formatDuration(Math.max(0, Math.floor((now.getTime() - dueAt) / 1000)));
      const worker = task.assignedTo?.name ?? 'Someone';
      const body = [
        `${worker} has exceeded the ${task.estimateMinutes} min estimate on`,
        `${task.project.code}-${task.number} "${truncate(task.title)}".`,
        `Over by ${overdueBy}.`,
      ].join(' ');
      const recipients = await this.managerRecipients(
        task.project.organizationId,
        task.project.managerUserId,
      );
      const sent = await this.dispatcher.notify({
        type: NOTIFICATION_TYPE.TASK_TIME_EXCEEDED,
        title: `Time exceeded on ${task.project.code}-${task.number}`,
        body,
        link: `/tasks/${task.id}`,
        entityType: 'task',
        entityId: task.id,
        dedupeKey: `task-time-exceeded:${task.id}`,
        recipients,
        excludeUserId: task.assignedToId,
      });
      notified += sent.created;
    }
    return notified;
  }

  private async managerRecipients(
    organizationId: string,
    managerUserId: string | null,
  ): Promise<Recipient[]> {
    const [manager, superAdmins] = await Promise.all([
      this.recipients.member(organizationId, managerUserId),
      this.recipients.withRoleKey(organizationId, ROLE_KEYS.SUPER_ADMIN),
    ]);
    const seen = new Set<string>();
    const merged: Recipient[] = [];
    for (const recipient of [...manager, ...superAdmins]) {
      if (seen.has(recipient.userId)) {
        continue;
      }
      seen.add(recipient.userId);
      merged.push(recipient);
    }
    return merged;
  }
}

function truncate(value: string, max = 80): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${totalSeconds}s`;
}
