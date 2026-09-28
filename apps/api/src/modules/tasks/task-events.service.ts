import { Injectable } from '@nestjs/common';
import {
  AUDIT_ENTITY_TYPE,
  NOTIFICATION_TYPE,
  type AuthenticatedUser,
  type NotificationType,
} from '@ashniva/types';

import { REALTIME_EVENTS } from '../../infrastructure/realtime/realtime-rooms';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { MilestoneProgressService } from '../milestones/milestone-progress.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import { TaskVisibilityService } from './task-visibility.service';
import type { TaskSummaryRow } from './tasks.repository';

/** What every task change ends with: an audit row and a realtime event to whoever may see it. */
@Injectable()
export class TaskEventsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly realtime: RealtimeService,
    private readonly milestones: MilestoneProgressService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
    private readonly visibility: TaskVisibilityService,
    private readonly prisma: PrismaService,
  ) {}

  async changed(
    actor: AuthenticatedUser,
    row: TaskSummaryRow,
    action: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLog.record({
      action,
      entityType: AUDIT_ENTITY_TYPE.TASK,
      entityId: row.id,
      after: { key: `${row.project.code}-${row.number}`, status: row.status, ...details },
    });
    if (row.milestoneId) {
      await this.milestones.recompute(row.milestoneId);
    }
    // To the people who may read the task, not to the organization room. The payload names the
    // task, its project and its new status; broadcasting that to every signed-in member told the
    // whole company that work exists and where it has got to, which is most of what the scope on
    // the read paths is there to withhold.
    this.realtime.emitToUsers(
      await this.visibility.audienceFor(row),
      REALTIME_EVENTS.TASK_UPDATED,
      {
        id: row.id,
        projectId: row.projectId,
        status: row.status,
        changedByUserId: actor.userId,
        at: new Date().toISOString(),
      },
    );
  }

  /** Task notifications: assignment, review requested, review returned, comment mentions. */
  async notify(
    actor: AuthenticatedUser,
    row: TaskSummaryRow,
    type: NotificationType,
    userIds: Array<string | null | undefined>,
    body: string | null = null,
    dedupeKey?: string,
  ): Promise<void> {
    const key = `${row.project.code}-${row.number}`;
    let mentionTitle: string | undefined;
    if (type === NOTIFICATION_TYPE.TASK_COMMENT_MENTION) {
      const actorUser = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { name: true },
      });
      mentionTitle = `${actorUser?.name ?? 'Somebody'} mentioned you on ${key}`;
    }
    const titles: Partial<Record<NotificationType, string>> = {
      [NOTIFICATION_TYPE.TASK_ASSIGNED]: `Assigned to you: ${key} ${row.title}`,
      [NOTIFICATION_TYPE.TASK_REVIEW_REQUESTED]: `Ready for review: ${key} ${row.title}`,
      [NOTIFICATION_TYPE.TASK_REVIEW_REJECTED]: `Returned to you: ${key} ${row.title}`,
      [NOTIFICATION_TYPE.TASK_COMMENT_MENTION]: mentionTitle,
    };
    await this.dispatcher.notify({
      type,
      title: titles[type] ?? `${key} ${row.title}`,
      body,
      link: `/tasks/${row.id}`,
      entityType: 'task',
      entityId: row.id,
      dedupeKey:
        dedupeKey ??
        `${type}:${row.id}:${row.status}:${row.assignedToId ?? ''}:${row.updatedAt.getTime()}`,
      recipients: await this.recipients.members(row.organizationId, userIds),
      excludeUserId: actor.userId,
    });
  }
}
