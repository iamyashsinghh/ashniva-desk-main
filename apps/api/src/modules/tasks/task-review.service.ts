import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  CLOSED_TASK_STATUSES,
  NOTIFICATION_TYPE,
  TASK_ACTION,
  TASK_STATUS,
  VISIBILITY,
  isTicketClosed,
  type AuthenticatedUser,
  type TaskDetail,
  type TaskStatus,
  type TicketStatus,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { ClientUpdatesRepository } from '../client-updates/client-updates.repository';
import { ContractsRepository } from '../contracts/contracts.repository';
import { HourLedgerService } from '../contracts/hour-ledger.service';
import { toReportDate } from '../reports/daily-report-builder';
import { refreshDailyReport } from '../reports/daily-report-collector';
import { WorkLogsRepository } from '../work-logs/work-logs.repository';
import { CommentsRepository } from './comments.repository';
import type { ReviewTaskDto, SubmitTaskDto } from './dto/task.dto';
import { TaskEventsService } from './task-events.service';
import { assertAction } from './task-workflow';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

/**
 * The review loop: the assignee submits (completion sheet → work log, files, IN_REVIEW) and the
 * tester / reviewer approves (COMPLETED, client update queued) or rejects (RETURNED_TO_DEV).
 */
@Injectable()
export class TaskReviewService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly tasks: TasksRepository,
    private readonly workLogs: WorkLogsRepository,
    private readonly clientUpdates: ClientUpdatesRepository,
    private readonly comments: CommentsRepository,
    private readonly prisma: PrismaService,
    private readonly events: TaskEventsService,
    private readonly contracts: ContractsRepository,
    private readonly ledger: HourLedgerService,
  ) {}

  /** The completion sheet: work log + optional files + client-visible flag, then IN_REVIEW. */
  async submit(actor: AuthenticatedUser, id: string, dto: SubmitTaskDto): Promise<TaskDetail> {
    const task = await this.tasksService.requireSummary(actor, id);
    assertAction(task, actor, TASK_ACTION.SUBMIT);
    const workDate = dto.workDate ? new Date(dto.workDate) : new Date(toReportDate(new Date()));
    const clientVisible = dto.clientVisible ?? task.clientVisible;
    const now = new Date();
    const row = await this.tasks.transition(
      task.organizationId,
      id,
      task.status,
      TASK_STATUS.IN_REVIEW,
      actor.userId,
      dto.summary,
      { submittedAt: now, startedAt: task.startedAt ?? now, clientVisible, blockedReason: null },
      async (tx) => {
        const workLog = await this.workLogs.create(
          {
            organizationId: actor.organizationId,
            taskId: id,
            userId: actor.userId,
            workDate,
            minutes: dto.minutes,
            summary: dto.summary,
            proofUrl: dto.proofUrl ?? null,
            gitRef: dto.gitRef ?? null,
          },
          tx,
        );
        if (dto.fileIds?.length) {
          await this.attachFiles(tx, actor.organizationId, dto.fileIds, {
            taskId: id,
            workLogId: workLog.id,
          });
        }
      },
    );
    if (clientVisible && dto.clientSummary) {
      // Kept as an internal note until approval turns it into the client update.
      await this.comments.create({
        organizationId: actor.organizationId,
        taskId: id,
        authorId: actor.userId,
        visibility: VISIBILITY.INTERNAL,
        body: `Client summary (used when publishing): ${dto.clientSummary}`,
      });
    }
    await refreshDailyReport(
      this.prisma,
      actor.organizationId,
      actor.userId,
      toReportDate(workDate),
    );
    await this.events.changed(actor, row, AUDIT_ACTION.TASK_STATUS_CHANGED, {
      from: task.status,
      minutes: dto.minutes,
      clientVisible,
    });
    await this.events.notify(
      actor,
      row,
      NOTIFICATION_TYPE.TASK_REVIEW_REQUESTED,
      [row.testerId, row.reviewerId, row.createdById],
      dto.summary,
    );
    return this.tasksService.get(actor, id);
  }

  async review(actor: AuthenticatedUser, id: string, dto: ReviewTaskDto): Promise<TaskDetail> {
    const task = await this.tasksService.requireSummary(actor, id);
    const approve = dto.outcome === 'APPROVE';
    assertAction(task, actor, approve ? TASK_ACTION.APPROVE : TASK_ACTION.REJECT);
    if (!approve && !dto.note?.trim()) {
      throw new BadRequestException('Explain what must change when rejecting');
    }
    const target: TaskStatus = approve ? TASK_STATUS.COMPLETED : TASK_STATUS.RETURNED_TO_DEV;
    const now = new Date();
    const note = dto.note?.trim() || (approve ? 'Approved' : null);
    const row = await this.tasks.transition(
      task.organizationId,
      id,
      task.status,
      target,
      actor.userId,
      note,
      approve ? { completedAt: now } : {},
      async (tx) => {
        if (approve && task.clientVisible && task.project.clientOrganizationId) {
          await this.clientUpdates.create(
            {
              organizationId: actor.organizationId,
              clientOrganizationId: task.project.clientOrganizationId,
              projectId: task.project.id,
              taskId: id,
              ticketId: task.ticket?.id,
              workDate: new Date(toReportDate(now)),
              title: task.title,
              body: await this.clientSummaryFor(tx, id, task.title),
              authorId: task.assignedToId ?? actor.userId,
            },
            tx,
          );
        }
      },
    );
    if (approve) {
      await this.consumeContractHours(actor, id, task);
      await this.noteTicketIfWorkIsDone(actor, task.ticket?.id ?? null);
    }
    if (dto.note?.trim()) {
      await this.comments.create({
        organizationId: actor.organizationId,
        taskId: id,
        authorId: actor.userId,
        visibility: VISIBILITY.INTERNAL,
        body: `${approve ? 'Approved' : 'Returned to developer'}: ${dto.note.trim()}`,
      });
    }
    if (approve && task.assignedToId) {
      await refreshDailyReport(
        this.prisma,
        actor.organizationId,
        task.assignedToId,
        toReportDate(now),
      );
    }
    await this.events.changed(actor, row, AUDIT_ACTION.TASK_REVIEWED, {
      outcome: dto.outcome,
      note,
    });
    if (!approve) {
      await this.events.notify(
        actor,
        row,
        NOTIFICATION_TYPE.TASK_REVIEW_REJECTED,
        [row.assignedToId],
        note,
      );
    }
    return this.tasksService.get(actor, id);
  }

  /**
   * Tells the ticket that the work raised from it is finished.
   *
   * A note, not a status change, and the distinction is the point. Converting a ticket into tasks
   * used to be a one-way door: the tasks were completed and the ticket sat wherever it was, so the
   * support person watching it had no way of knowing the work was done short of opening every
   * linked task. Writing RESOLVED here instead would be worse — whether a client's problem is
   * actually solved is a judgement about the client's problem, not about a checklist, and the
   * person who owns the ticket is the one who should make it. So this puts the fact on the ticket's
   * activity trail and leaves the decision alone.
   *
   * Silent when any sibling is still open, and silent about tickets that are already closed.
   *
   * Written through Prisma rather than through `TicketsRepository`: the tickets module imports the
   * tasks module, so reaching back the other way would make the pair cyclic. One `create` of the
   * row that repository's `addActivity` writes is a smaller price than a `forwardRef`.
   */
  private async noteTicketIfWorkIsDone(
    actor: AuthenticatedUser,
    ticketId: string | null,
  ): Promise<void> {
    if (!ticketId) {
      return;
    }
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, organizationId: actor.organizationId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!ticket || isTicketClosed(ticket.status as TicketStatus)) {
      return;
    }
    const stillOpen = await this.prisma.task.count({
      where: {
        ticketId,
        organizationId: actor.organizationId,
        deletedAt: null,
        status: { notIn: [...CLOSED_TASK_STATUSES] },
      },
    });
    if (stillOpen > 0) {
      return;
    }
    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId,
        fromStatus: ticket.status,
        toStatus: ticket.status,
        changedById: actor.userId,
        note: 'All linked work completed',
      },
    });
  }

  /** The most recent "client summary" left at submission, or the last work-log summary. */
  private async clientSummaryFor(
    tx: Prisma.TransactionClient,
    taskId: string,
    fallback: string,
  ): Promise<string> {
    const marker = 'Client summary (used when publishing): ';
    const comment = await tx.comment.findFirst({
      where: { taskId, body: { startsWith: marker }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (comment) {
      return comment.body.slice(marker.length);
    }
    const log = await tx.workLog.findFirst({ where: { taskId }, orderBy: { createdAt: 'desc' } });
    return log?.summary ?? fallback;
  }

  private async attachFiles(
    tx: Prisma.TransactionClient,
    organizationId: string,
    fileIds: string[],
    data: { taskId: string; workLogId: string },
  ): Promise<void> {
    await tx.file.updateMany({
      where: { id: { in: fileIds }, organizationId, deletedAt: null },
      data,
    });
  }

  /**
   * Approved work consumes the client's support hours: every work log of the task that has not
   * been deducted yet is posted to the applicable contract (project contract first, then the
   * client-wide one). The ledger makes a second deduction impossible.
   */
  private async consumeContractHours(
    actor: AuthenticatedUser,
    taskId: string,
    task: {
      project: { id: string; clientOrganizationId: string | null };
      ticket: { id: string } | null;
    },
  ): Promise<void> {
    if (!task.project.clientOrganizationId) {
      return;
    }
    const logs = await this.prisma.workLog.findMany({
      where: { taskId, ledgerEntries: { none: { kind: 'CONSUMED' } } },
      select: { id: true, minutes: true, workDate: true },
    });
    for (const log of logs) {
      const contract = await this.contracts.findHourContractForProject(
        actor.organizationId,
        task.project.id,
        task.project.clientOrganizationId,
        log.workDate,
      );
      if (!contract) {
        continue;
      }
      await this.ledger.consumeWorkLog({
        contractId: contract.id,
        workLogId: log.id,
        ticketId: task.ticket?.id ?? null,
        minutes: log.minutes,
        workDate: log.workDate,
        actorUserId: actor.userId,
      });
    }
  }
}
