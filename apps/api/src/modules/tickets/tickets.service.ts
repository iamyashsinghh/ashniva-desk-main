import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PERMISSIONS,
  PRIORITY,
  TICKET_ACTION,
  TICKET_LIST_VIEW,
  TICKET_SOURCE,
  TICKET_STATUS,
  TICKET_TYPE,
  VISIBILITY,
  type AuthenticatedUser,
  type CommentSummary,
  type PaginatedResponse,
  type TicketDetail,
  type TicketSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { TicketSlaService } from '../sla-escalations/ticket-sla.service';
import { CallbackEmitterService } from '../support-callbacks/callback-emitter.service';
import { CommentsRepository } from '../tasks/comments.repository';
import { todayUtc } from '../tasks/tasks.mapper';
import { toComment } from '../tasks/tasks.mapper';
import type { CreateTicketDto, ListTicketsQueryDto, TicketCommentDto } from './dto/ticket.dto';
import { fingerprintTicket } from './ticket-fingerprint';
import { assertTicketAction, listTicketActions } from './ticket-workflow';
import { TicketEventsService } from './ticket-events.service';
import { ticketKey, toTicketDetail, toTicketSummary } from './tickets.mapper';
import {
  OPEN_TICKET_STATUS_LIST,
  TicketsRepository,
  type TicketListFilter,
  type TicketSummaryRow,
} from './tickets.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's resolutions, on the same server day the dashboard counts. */
function resolvedTodayWindow(): { resolvedFrom: Date; resolvedTo: Date } {
  const today = todayUtc();
  return { resolvedFrom: today, resolvedTo: new Date(today.getTime() + DAY_MS) };
}

/** Reads, raising and comments. Status changes live in TicketTransitionsService. */
@Injectable()
export class TicketsService {
  constructor(
    private readonly tickets: TicketsRepository,
    private readonly comments: CommentsRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly events: TicketEventsService,
    private readonly sla: TicketSlaService,
    private readonly callbacks: CallbackEmitterService,
    @InjectQueue(QUEUE_NAMES.ROUTING_MONITOR) private readonly routingQueue: Queue,
  ) {}

  /**
   * Asks the router to place a newly raised ticket.
   *
   * A queued job rather than a direct call, for two reasons. Routing reads five tables and
   * dispatches notifications, and none of that belongs in the latency a client sees when they
   * report a problem. And a router that failed would otherwise fail the raise itself — the ticket
   * has to exist whether or not anybody can be found to take it, which is the entire point of the
   * support queue. A failure here is logged and the ticket simply stays unrouted until somebody
   * re-routes it from the queue screen.
   */
  private async requestRouting(organizationId: string, ticketId: string): Promise<void> {
    try {
      await this.routingQueue.add(
        'route-ticket',
        { organizationId, ticketId },
        { removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 2_000 } },
      );
    } catch {
      // Redis being down must not stop a client raising a ticket.
    }
  }

  async list(
    actor: AuthenticatedUser,
    query: ListTicketsQueryDto,
  ): Promise<PaginatedResponse<TicketSummary>> {
    const filter = await this.buildFilter(actor, query);
    const page = await this.tickets.list(filter);
    return {
      items: page.items.map(toTicketSummary),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<TicketDetail> {
    const internal = isInternalUser(actor);
    const organizationId = await this.providerId(actor);
    const row = await this.tickets.findDetail(
      organizationId,
      id,
      internal ? undefined : actor.organizationId,
    );
    if (!row) {
      throw new NotFoundException('Ticket not found');
    }
    return toTicketDetail(row, listTicketActions(row, actor), {
      includeInternalComments: internal && actor.permissions.includes(PERMISSIONS.COMMENT_INTERNAL),
    });
  }

  /** Clients raise for their own company; internal staff may raise on a client's behalf. */
  async create(
    actor: AuthenticatedUser,
    dto: CreateTicketDto,
    source = TICKET_SOURCE.PORTAL,
  ): Promise<TicketDetail> {
    const internal = isInternalUser(actor);
    const organizationId = await this.providerId(actor);
    let clientOrganizationId = actor.organizationId;
    let requesterId = actor.userId;
    if (internal) {
      clientOrganizationId = dto.clientOrganizationId ?? actor.organizationId;
      if (dto.requesterId) {
        const requester = await this.prisma.organizationMembership.findFirst({
          where: { organizationId: clientOrganizationId, userId: dto.requesterId, deletedAt: null },
        });
        if (!requester) {
          throw new BadRequestException('The requester is not a member of that organization');
        }
        requesterId = dto.requesterId;
      }
    } else if (dto.clientOrganizationId && dto.clientOrganizationId !== actor.organizationId) {
      throw new ForbiddenException('You can only raise tickets for your own organization');
    }
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: {
          id: dto.projectId,
          organizationId,
          deletedAt: null,
          ...(internal ? {} : { clientOrganizationId }),
        },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
    }

    const module = dto.module ?? null;
    const productVersion = dto.productVersion?.trim() || null;
    const row = await this.tickets.create(
      organizationId,
      {
        clientOrganizationId,
        requesterId,
        title: dto.title,
        description: dto.description,
        type: dto.type ?? TICKET_TYPE.SUPPORT,
        priority: dto.priority ?? PRIORITY.MEDIUM,
        source: internal ? TICKET_SOURCE.INTERNAL : source,
        projectId: dto.projectId ?? null,
        module,
        impact: dto.impact ?? null,
        productVersion,
        // Duplicate detection only works on tickets that were indexed when they were raised, so
        // this happens in the same call rather than in a job that could be behind.
        ...fingerprintTicket({
          title: dto.title,
          description: dto.description,
          module,
          // A ticket raised on the desk or in the portal is not against a registered product;
          // the ingress path is the one that fills this in.
          productId: null,
          productVersion,
        }),
      },
      dto.fileIds ?? [],
    );
    await this.auditLog.record({
      action: AUDIT_ACTION.TICKET_CREATED,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: row.id,
      organizationId,
      after: {
        key: ticketKey(row),
        title: row.title,
        clientOrganizationId,
        priority: row.priority,
      },
    });
    await this.sla.start(row);
    this.events.changed(actor, row);
    await this.events.raised(actor, row);
    await this.requestRouting(organizationId, row.id);
    return this.get(actor, row.id);
  }

  async addComment(
    actor: AuthenticatedUser,
    id: string,
    dto: TicketCommentDto,
  ): Promise<CommentSummary> {
    const ticket = await this.requireSummary(actor, id);
    const visibility = dto.visibility ?? VISIBILITY.CLIENT;
    assertTicketAction(
      ticket,
      actor,
      visibility === VISIBILITY.INTERNAL ? TICKET_ACTION.NOTE_INTERNAL : TICKET_ACTION.REPLY_PUBLIC,
    );
    const row = await this.comments.create({
      organizationId: ticket.organizationId,
      ticketId: id,
      authorId: actor.userId,
      body: dto.body,
      visibility,
    });
    if (visibility === VISIBILITY.CLIENT && isInternalUser(actor)) {
      await this.sla.onPublicReply(id);
    }
    if (visibility === VISIBILITY.CLIENT) {
      await this.events.replied(actor, ticket, dto.body);
      // Public replies only, and the emitter has no overload for anything else. An internal note
      // never reaches this branch, and `SupportCallbackPayload` has no field it could occupy.
      await this.callbacks.publicComment(ticket.organizationId, id, {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
      });
    }
    // A client answering "waiting for client" puts the ticket back in progress automatically.
    if (
      visibility === VISIBILITY.CLIENT &&
      !isInternalUser(actor) &&
      ticket.status === TICKET_STATUS.WAITING_CLIENT
    ) {
      const resumed = await this.tickets.transition(
        ticket.organizationId,
        id,
        ticket.status,
        TICKET_STATUS.IN_PROGRESS,
        actor.userId,
        'Client replied',
      );
      await this.sla.onStatusChanged(id, TICKET_STATUS.IN_PROGRESS);
      this.events.changed(actor, resumed);
    }
    return toComment(row);
  }

  /** Internal staff see every ticket of the provider; clients only their organization's rows. */
  async requireSummary(actor: AuthenticatedUser, id: string): Promise<TicketSummaryRow> {
    const organizationId = await this.providerId(actor);
    const row = await this.tickets.findSummary(organizationId, id);
    if (!row || (!isInternalUser(actor) && row.clientOrganizationId !== actor.organizationId)) {
      throw new NotFoundException('Ticket not found');
    }
    return row;
  }

  async providerId(actor: AuthenticatedUser): Promise<string> {
    if (isInternalUser(actor)) {
      return actor.organizationId;
    }
    const provider = await this.organizations.findServiceProvider();
    if (!provider) {
      throw new NotFoundException('Service provider organization is not configured');
    }
    return provider.id;
  }

  private async buildFilter(
    actor: AuthenticatedUser,
    query: ListTicketsQueryDto,
  ): Promise<TicketListFilter> {
    const internal = isInternalUser(actor);
    const base: TicketListFilter = {
      organizationId: await this.providerId(actor),
      // Clients are pinned to their own organization whatever the query says.
      clientOrganizationId: internal ? query.clientOrganizationId : actor.organizationId,
      status: query.status,
      projectId: query.projectId,
      assignedToId: query.assignedToId,
      priority: query.priority,
      type: query.type,
      search: query.search,
      // Narrows any view to today's resolutions, so the "Resolved today" card can link to
      // exactly what it counted instead of to every ticket ever resolved.
      ...(query.resolvedToday ? resolvedTodayWindow() : {}),
      limit: query.limit,
      cursor: query.cursor,
    };
    switch (query.view ?? TICKET_LIST_VIEW.OPEN) {
      case TICKET_LIST_VIEW.OPEN:
        return { ...base, status: query.status ?? OPEN_TICKET_STATUS_LIST };
      case TICKET_LIST_VIEW.NEW:
        return { ...base, status: [TICKET_STATUS.NEW, TICKET_STATUS.REOPENED] };
      case TICKET_LIST_VIEW.MINE:
        return internal
          ? { ...base, assignedToId: actor.userId, status: query.status ?? OPEN_TICKET_STATUS_LIST }
          : { ...base, requesterId: actor.userId };
      case TICKET_LIST_VIEW.WAITING:
        return { ...base, status: [TICKET_STATUS.WAITING_CLIENT] };
      case TICKET_LIST_VIEW.CRITICAL:
        return {
          ...base,
          priority: PRIORITY.CRITICAL,
          status: query.status ?? OPEN_TICKET_STATUS_LIST,
        };
      case TICKET_LIST_VIEW.SLA_AT_RISK:
        return { ...base, slaRisk: 'at-risk' };
      case TICKET_LIST_VIEW.SLA_BREACHED:
        return { ...base, slaRisk: 'breached' };
      case TICKET_LIST_VIEW.RESOLVED:
        return { ...base, status: [TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED] };
      case TICKET_LIST_VIEW.ALL:
      default:
        return base;
    }
  }
}
