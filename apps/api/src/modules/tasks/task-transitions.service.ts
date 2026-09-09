import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  NOTIFICATION_TYPE,
  TASK_ACTION,
  TASK_STATUS,
  type AuthenticatedUser,
  type TaskDetail,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { refreshDailyReport } from '../reports/daily-report-collector';
import { WorkLogsRepository } from '../work-logs/work-logs.repository';
import type { AssignTaskDto, LogWorkDto } from './dto/task.dto';
import { TaskEventsService } from './task-events.service';
import { assertAction, unblockTarget } from './task-workflow';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

/**
 * Assign, start, block, unblock, reopen, cancel and time logging: permission + transition
 * check (task-workflow.ts), one transaction for the row and its history, then audit + realtime.
 * Submission and review live in TaskReviewService.
 */
@Injectable()
export class TaskTransitionsService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly tasks: TasksRepository,
    private readonly workLogs: WorkLogsRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly events: TaskEventsService,
  ) {}

  async assign(actor: AuthenticatedUser, id: string, dto: AssignTaskDto): Promise<TaskDetail> {
    const task = await this.tasksService.requireSummary(actor, id);
    assertAction(task, actor, TASK_ACTION.ASSIGN);
    const member = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: actor.organizationId, userId: dto.assignedToId, deletedAt: null },
      include: { user: { select: { name: true } } },
    });
    if (!member) {
      throw new BadRequestException('The assignee is not a member of your organization');
    }
    const note = dto.note ?? `Assigned to ${member.user.name}`;
    const row =
      task.status === TASK_STATUS.DRAFT
        ? await this.tasks.transition(
            task.organizationId,
            id,
            task.status,
            TASK_STATUS.ASSIGNED,
            actor.userId,
            note,
            { assignedToId: dto.assignedToId },
          )
        : await this.tasks.update(task.organizationId, id, {
            assignedToId: dto.assignedToId,
            statusHistory: {
              create: {
                fromStatus: task.status,
                toStatus: task.status,
                changedById: actor.userId,
                note,
              },
            },
          });
    await this.events.changed(actor, row, AUDIT_ACTION.TASK_ASSIGNED, {
      assignedToId: dto.assignedToId,
    });
    await this.events.notify(actor, row, NOTIFICATION_TYPE.TASK_ASSIGNED, [dto.assignedToId], note);
    return this.tasksService.get(actor, id);
  }

  async start(actor: AuthenticatedUser, id: string): Promise<TaskDetail> {
    const task = await this.tasksService.requireSummary(actor, id);
    assertAction(task, actor, TASK_ACTION.START);
    const row = await this.tasks.transition(
      task.organizationId,
      id,
      task.status,
      TASK_STATUS.IN_PROGRESS,
      actor.userId,
      null,
      {
        startedAt: task.startedAt ?? new Date(),
        blockedReason: null,
      },
    );
    await this.events.changed(actor, row, AUDIT_ACTION.TASK_STATUS_CHANGED, { from: task.status });
    return this.tasksService.get(actor, id);
  }

  async block(actor: AuthenticatedUser, id: string, reason: string): Promise<TaskDetail> {
    const task = await this.tasksService.requireSummary(actor, id);
    assertAction(task, actor, TASK_ACTION.BLOCK);
    const row = await this.tasks.transition(
      task.organizationId,
      id,
      task.status,
      TASK_STATUS.BLOCKED,
      actor.userId,
      reason,
      {
        blockedReason: reason,
      },
    );
    await this.events.changed(actor, row, AUDIT_ACTION.TASK_STATUS_CHANGED, {
      from: task.status,
      reason,
    });
    return this.tasksService.get(actor, id);
  }

  async unblock(actor: AuthenticatedUser, id: string, note?: string): Promise<TaskDetail> {
    const task = await this.tasksService.requireSummary(actor, id);
    assertAction(task, actor, TASK_ACTION.UNBLOCK);
    const target = unblockTarget(task);
    const row = await this.tasks.transition(
      task.organizationId,
      id,
      task.status,
      target,
      actor.userId,
      note ?? null,
      { blockedReason: null },
    );
    await this.events.changed(actor, row, AUDIT_ACTION.TASK_STATUS_CHANGED, { from: task.status });
    return this.tasksService.get(actor, id);
  }

  async reopen(actor: AuthenticatedUser, id: string, reason: string): Promise<TaskDetail> {
    const task = await this.tasksService.requireSummary(actor, id);
    assertAction(task, actor, TASK_ACTION.REOPEN);
    const row = await this.tasks.transition(
      task.organizationId,
      id,
      task.status,
      TASK_STATUS.REOPENED,
      actor.userId,
      reason,
      {
        completedAt: null,
        submittedAt: null,
      },
    );
    await this.events.changed(actor, row, AUDIT_ACTION.TASK_STATUS_CHANGED, {
      from: task.status,
      reason,
    });
    return this.tasksService.get(actor, id);
  }

  async cancel(actor: AuthenticatedUser, id: string, reason: string): Promise<TaskDetail> {
    const task = await this.tasksService.requireSummary(actor, id);
    assertAction(task, actor, TASK_ACTION.CANCEL);
    const row = await this.tasks.transition(
      task.organizationId,
      id,
      task.status,
      TASK_STATUS.CANCELLED,
      actor.userId,
      reason,
    );
    await this.events.changed(actor, row, AUDIT_ACTION.TASK_STATUS_CHANGED, {
      from: task.status,
      reason,
    });
    return this.tasksService.get(actor, id);
  }

  async logWork(actor: AuthenticatedUser, id: string, dto: LogWorkDto): Promise<TaskDetail> {
    const task = await this.tasksService.requireSummary(actor, id);
    assertAction(task, actor, TASK_ACTION.LOG_WORK);
    await this.workLogs.create({
      organizationId: actor.organizationId,
      taskId: id,
      userId: actor.userId,
      workDate: new Date(dto.workDate),
      minutes: dto.minutes,
      summary: dto.summary,
      proofUrl: dto.proofUrl ?? null,
      gitRef: dto.gitRef ?? null,
    });
    await refreshDailyReport(this.prisma, actor.organizationId, actor.userId, dto.workDate);
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_LOGGED,
      entityType: AUDIT_ENTITY_TYPE.WORK_LOG,
      entityId: id,
      after: { taskId: id, minutes: dto.minutes, workDate: dto.workDate },
    });
    return this.tasksService.get(actor, id);
  }
}
