import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  TASK_STATUS,
  TICKET_ACTION,
  TICKET_STATUS,
  type AuthenticatedUser,
  type TicketDetail,
  type TicketStatus,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { TicketSlaService } from '../sla-escalations/ticket-sla.service';
import { CallbackEmitterService } from '../support-callbacks/callback-emitter.service';
import { TasksRepository } from '../tasks/tasks.repository';
import type { AssignTicketDto, ConvertTicketDto } from './dto/ticket.dto';
import { assertTicketAction } from './ticket-workflow';
import { TicketEventsService } from './ticket-events.service';
import { ticketKey } from './tickets.mapper';
import { TicketsRepository, type TicketSummaryRow } from './tickets.repository';
import { TicketsService } from './tickets.service';

/** Assignment, every status change, and ticket → task conversion. */
@Injectable()
export class TicketTransitionsService {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly tickets: TicketsRepository,
    private readonly tasks: TasksRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly events: TicketEventsService,
    private readonly sla: TicketSlaService,
    private readonly callbacks: CallbackEmitterService,
  ) {}

  async assign(actor: AuthenticatedUser, id: string, dto: AssignTicketDto): Promise<TicketDetail> {
    const ticket = await this.ticketsService.requireSummary(actor, id);
    assertTicketAction(ticket, actor, TICKET_ACTION.ASSIGN);
    const member = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: ticket.organizationId, userId: dto.assignedToId, deletedAt: null },
      include: { user: { select: { name: true } } },
    });
    if (!member) {
      throw new BadRequestException('The assignee must be internal staff');
    }
    const note = dto.note ?? `Assigned to ${member.user.name}`;
    const data = {
      assignedToId: dto.assignedToId,
      ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(dto.type ? { type: dto.type } : {}),
    };
    const row =
      ticket.status === TICKET_STATUS.NEW || ticket.status === TICKET_STATUS.REOPENED
        ? await this.tickets.transition(
            ticket.organizationId,
            id,
            ticket.status,
            TICKET_STATUS.ASSIGNED,
            actor.userId,
            note,
            data,
          )
        : await this.tickets.update(ticket.organizationId, id, {
            ...data,
            statusHistory: {
              create: {
                fromStatus: ticket.status,
                toStatus: ticket.status,
                changedById: actor.userId,
                note,
              },
            },
          });
    if (row.status !== ticket.status) {
      await this.sla.onStatusChanged(id, row.status as TicketStatus);
    }
    if (dto.priority && dto.priority !== ticket.priority) {
      await this.sla.onPriorityChanged(row);
    }
    await this.finish(actor, row, AUDIT_ACTION.TICKET_ASSIGNED, { assignedToId: dto.assignedToId });
    return this.ticketsService.get(actor, id);
  }

  start(actor: AuthenticatedUser, id: string, note?: string): Promise<TicketDetail> {
    return this.move(actor, id, TICKET_ACTION.START, TICKET_STATUS.IN_PROGRESS, note ?? null);
  }

  waitForClient(actor: AuthenticatedUser, id: string, note?: string): Promise<TicketDetail> {
    return this.move(
      actor,
      id,
      TICKET_ACTION.WAIT_CLIENT,
      TICKET_STATUS.WAITING_CLIENT,
      note ?? null,
    );
  }

  resume(actor: AuthenticatedUser, id: string, note?: string): Promise<TicketDetail> {
    return this.move(actor, id, TICKET_ACTION.RESUME, TICKET_STATUS.IN_PROGRESS, note ?? null);
  }

  review(actor: AuthenticatedUser, id: string, note?: string): Promise<TicketDetail> {
    return this.move(actor, id, TICKET_ACTION.REVIEW, TICKET_STATUS.REVIEW, note ?? null);
  }

  resolve(actor: AuthenticatedUser, id: string, resolution: string): Promise<TicketDetail> {
    return this.move(actor, id, TICKET_ACTION.RESOLVE, TICKET_STATUS.RESOLVED, resolution, {
      resolution,
      resolvedAt: new Date(),
    });
  }

  close(actor: AuthenticatedUser, id: string, note?: string): Promise<TicketDetail> {
    return this.move(actor, id, TICKET_ACTION.CLOSE, TICKET_STATUS.CLOSED, note ?? null, {
      closedAt: new Date(),
    });
  }

  reopen(actor: AuthenticatedUser, id: string, reason: string): Promise<TicketDetail> {
    return this.move(actor, id, TICKET_ACTION.REOPEN, TICKET_STATUS.REOPENED, reason, {
      resolvedAt: null,
      closedAt: null,
      resolution: null,
    });
  }

  cancel(actor: AuthenticatedUser, id: string, reason: string): Promise<TicketDetail> {
    return this.move(actor, id, TICKET_ACTION.CANCEL, TICKET_STATUS.CANCELLED, reason);
  }

  /** One ticket becomes one or many linked tasks; a NEW ticket becomes ASSIGNED to the first assignee. */
  async convert(
    actor: AuthenticatedUser,
    id: string,
    dto: ConvertTicketDto,
  ): Promise<TicketDetail> {
    const ticket = await this.ticketsService.requireSummary(actor, id);
    assertTicketAction(ticket, actor, TICKET_ACTION.CONVERT);
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, organizationId: ticket.organizationId, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const createdKeys: string[] = [];
    for (const input of dto.tasks) {
      const task = await this.tasks.create(
        ticket.organizationId,
        {
          projectId: project.id,
          title: input.title,
          description:
            input.description ?? `${ticket.description}\n\n(From ticket ${ticketKey(ticket)})`,
          status: input.assignedToId ? TASK_STATUS.ASSIGNED : TASK_STATUS.DRAFT,
          priority: dto.priority ?? ticket.priority,
          assignedToId: input.assignedToId ?? null,
          createdById: actor.userId,
          testerId: dto.testerId ?? null,
          ticketId: ticket.id,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          clientVisible: dto.clientVisible ?? true,
          module: ticket.module,
        },
        `Created from ticket ${ticketKey(ticket)}`,
      );
      createdKeys.push(`${task.project.code}-${task.number}`);
    }
    const firstAssignee = dto.tasks.find((input) => input.assignedToId)?.assignedToId ?? null;
    const note = `Converted into ${createdKeys.join(', ')}`;
    const row =
      ticket.status === TICKET_STATUS.NEW || ticket.status === TICKET_STATUS.REOPENED
        ? await this.tickets.transition(
            ticket.organizationId,
            id,
            ticket.status,
            TICKET_STATUS.ASSIGNED,
            actor.userId,
            note,
            {
              assignedToId: ticket.assignedToId ?? firstAssignee,
              ...(project.id !== ticket.projectId ? { projectId: project.id } : {}),
            },
          )
        : await this.tickets.addActivity(
            ticket.organizationId,
            id,
            ticket.status,
            actor.userId,
            note,
          );
    if (row.status !== ticket.status) {
      await this.sla.onStatusChanged(id, row.status as TicketStatus);
    }
    await this.finish(actor, row, AUDIT_ACTION.TICKET_CONVERTED, { tasks: createdKeys });
    return this.ticketsService.get(actor, id);
  }

  private async move(
    actor: AuthenticatedUser,
    id: string,
    action: (typeof TICKET_ACTION)[keyof typeof TICKET_ACTION],
    target: TicketStatus,
    note: string | null,
    data: Record<string, unknown> = {},
  ): Promise<TicketDetail> {
    const ticket = await this.ticketsService.requireSummary(actor, id);
    assertTicketAction(ticket, actor, action);
    const row = await this.tickets.transition(
      ticket.organizationId,
      id,
      ticket.status,
      target,
      actor.userId,
      note,
      data,
    );
    await this.sla.onStatusChanged(id, target);
    await this.finish(actor, row, AUDIT_ACTION.TICKET_STATUS_CHANGED, {
      from: ticket.status,
      note,
    });
    return this.ticketsService.get(actor, id);
  }

  /**
   * The three things every transition owes the rest of the system: an audit row, a realtime event
   * and — when the ticket came from a registered product — a callback to whoever raised it.
   *
   * The callback goes here rather than at each call site so that no transition can be added later
   * that quietly does not tell the customer. It never throws: the ticket has already moved, and a
   * customer's unreachable endpoint must not turn a resolve into an error.
   */
  private async finish(
    actor: AuthenticatedUser,
    row: TicketSummaryRow,
    action: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLog.record({
      action,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: row.id,
      organizationId: row.organizationId,
      after: { key: ticketKey(row), status: row.status, ...details },
    });
    this.events.changed(actor, row);
    // The transition's own timestamp, not "now". The emitter's idempotency key is built from the
    // moment, so passing a fresh clock reading would make two emissions of *this* transition —
    // a retried request, a re-run job — two millisecond-distinct keys and two deliveries. The
    // row's `updatedAt` is the same value however often the emission is repeated, while a genuine
    // second visit to the same status carries a later one and is a second delivery, as it should
    // be.
    await this.callbacks.ticketStatusChanged(
      row.organizationId,
      row.id,
      row.status as TicketStatus,
      row.updatedAt,
    );
  }
}
