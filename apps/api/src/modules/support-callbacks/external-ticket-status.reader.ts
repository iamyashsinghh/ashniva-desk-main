import { Injectable, NotFoundException } from '@nestjs/common';
import {
  VISIBILITY,
  toClientVisibleTicketStatus,
  type ExternalTicketStatus,
  type TicketStatus,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { ticketKey } from '../tickets/tickets.mapper';

/**
 * The one place a ticket becomes something an external system may see.
 *
 * There were two readers before this: the ingress status endpoint built one, and a callback would
 * have had to build another. Two builders of the same allow-list is two chances for one of them to
 * gain a field — and the field somebody adds under pressure is the assignee, because a customer
 * asked who is working on their ticket. So there is one.
 *
 * The filtering is in the query, not applied to its result. `visibility: CLIENT` is a `where`
 * clause on the comments, so an internal note is never loaded in the first place; a filter applied
 * afterwards is one refactor away from being dropped, and the refactor would look harmless.
 *
 * What is deliberately absent, and has no field on `ExternalTicketStatus` to be put in: the
 * assignee, the team, the routing state and trail, internal comments, internal chat, work logs,
 * costs, estimates, call recordings and root-cause analyses.
 */
@Injectable()
export class ExternalTicketStatusReader {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param productId when given, the ticket must belong to that product. The ingress passes it so
   * one product cannot read another's tickets by guessing an id; the callback sender passes it too,
   * because a delivery row and the ticket it is about must not be able to drift apart.
   * @param externalUserId when given, the ticket must also have been raised by that person. The
   * widget passes it, because a browser session is minted for one end user and product scope alone
   * would let any of a product's users read every other user's ticket by guessing an id. The server
   * ingress leaves it out: a machine credential legitimately speaks for the whole product.
   */
  async read(
    organizationId: string,
    ticketId: string,
    productId?: string,
    externalUserId?: string,
  ): Promise<ExternalTicketStatus> {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId,
        ...(productId ? { productId } : {}),
        ...(externalUserId ? { externalRequester: { externalId: externalUserId } } : {}),
        deletedAt: null,
      },
      select: {
        id: true,
        number: true,
        organizationId: true,
        title: true,
        status: true,
        priority: true,
        externalReference: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        comments: {
          where: { visibility: VISIBILITY.CLIENT, deletedAt: null },
          select: { body: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return {
      ticketId: ticket.id,
      key: ticketKey(ticket),
      // The client-visible vocabulary, exactly as the portal uses it. The raw enum says
      // AUTO_ASSIGNED, ACKNOWLEDGED, ESCALATED and REVIEW — how Ashniva routes and escalates a
      // ticket, which is not the calling product's business and certainly not its end users'. It
      // rode out of here on every status poll and inside every outbound callback body.
      status: toClientVisibleTicketStatus(ticket.status as TicketStatus),
      priority: ticket.priority,
      title: ticket.title,
      externalReference: ticket.externalReference,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      updates: ticket.comments.map((row) => ({
        at: row.createdAt.toISOString(),
        body: row.body,
      })),
    };
  }
}
