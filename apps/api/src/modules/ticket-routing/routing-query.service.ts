import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OPEN_TICKET_STATUSES,
  PERMISSIONS,
  ROUTING_OUTCOME,
  type AuthenticatedUser,
  type TicketRoutingDetail,
  type UnassignedTicketSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { ticketKey } from '../tickets/tickets.mapper';
import { toRoutingState, toRoutingTrailRow } from './ticket-routing.mapper';
import { TicketRoutingRepository } from './ticket-routing.repository';

/**
 * Reading routing decisions back.
 *
 * The split enforced here is the one that matters for privacy: **state is ordinary ticket
 * information; the trail is not**. The trail names people who were passed over and says why —
 * that one of them is on leave, that another is at their limit — and that is staff data. So the
 * state is returned to any internal user who can see the ticket, and the trail only to somebody
 * holding `support-routing:manage`. A client reaches neither, at any URL.
 */
@Injectable()
export class RoutingQueryService {
  constructor(
    private readonly routing: TicketRoutingRepository,
    private readonly prisma: PrismaService,
  ) {}

  async detail(actor: AuthenticatedUser, ticketId: string): Promise<TicketRoutingDetail> {
    this.assertInternal(actor);
    const ticket = await this.prisma.ticket.count({
      where: { id: ticketId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (ticket === 0) {
      throw new NotFoundException('Ticket not found');
    }

    const state = await this.routing.findState(actor.organizationId, ticketId);
    const mayInspect = actor.permissions.includes(PERMISSIONS.SUPPORT_ROUTING_MANAGE);
    // An empty trail for somebody without the permission, rather than a 403: the routing panel
    // is part of the ticket screen, and refusing the whole screen to a developer who is allowed
    // to see their own ticket would be the wrong shape of answer.
    const trail = mayInspect ? await this.routing.trailFor(actor.organizationId, ticketId) : [];

    return {
      state: state ? toRoutingState(state) : null,
      trail: trail.map(toRoutingTrailRow),
    };
  }

  /**
   * Everything nobody is working on: unassigned, or parked in the support queue by the router.
   *
   * This is the screen that makes "the ticket is never dropped" true rather than merely intended.
   * A ticket the router could not place has to be somewhere a person looks.
   */
  async queue(actor: AuthenticatedUser, limit = 50): Promise<UnassignedTicketSummary[]> {
    this.assertInternal(actor);
    if (!actor.permissions.includes(PERMISSIONS.SUPPORT_ROUTING_MANAGE)) {
      throw new ForbiddenException(
        'Viewing the support queue needs the support-routing permission',
      );
    }
    const rows = await this.prisma.ticket.findMany({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        status: { in: [...OPEN_TICKET_STATUSES] },
        OR: [{ assignedToId: null }, { routingState: { outcome: ROUTING_OUTCOME.SUPPORT_QUEUE } }],
      },
      include: {
        project: { select: { id: true, code: true } },
        clientOrganization: { select: { name: true } },
        routingState: { select: { queueReason: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      key: ticketKey(row),
      title: row.title,
      priority: row.priority,
      status: row.status,
      project: row.project ? { id: row.project.id, code: row.project.code } : null,
      module: row.module,
      clientOrganizationName: row.clientOrganization.name,
      createdAt: row.createdAt.toISOString(),
      queueReason: row.routingState?.queueReason ?? null,
    }));
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      // Routing is how the provider organises itself. It is not part of what a client is shown
      // about their own ticket, and there is no client-facing shape of this data at all.
      throw new ForbiddenException('Routing information is internal');
    }
  }
}
