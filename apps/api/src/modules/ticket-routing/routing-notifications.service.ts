import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPE, PERMISSIONS } from '@ashniva/types';

import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import { ticketKey } from '../tickets/tickets.mapper';
import type { TicketSummaryRow } from '../tickets/tickets.repository';

/**
 * Routing's five notifications, all through the existing dispatcher.
 *
 * Nothing here sends anything itself: preferences, de-duplication, grouping, quiet hours and rate
 * limiting are the dispatcher's job, and a second delivery path would have its own opinion about
 * every one of those. What this file owns is *who* should hear about a routing event and what the
 * message says — nothing more.
 *
 * The dedupe keys matter more than usual here. The acknowledgement sweep runs every two minutes
 * and will keep finding the same overdue ticket until somebody acts on it, so without a key the
 * assignee would be told thirty times an hour. The key is per ticket and per attempt, so a
 * *new* attempt does notify again, which is the point.
 */
@Injectable()
export class RoutingNotificationsService {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  /** The router chose somebody: tell them, and tell whoever manages routing on that project. */
  async autoAssigned(ticket: TicketSummaryRow, userId: string): Promise<void> {
    const key = ticketKey(ticket);
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.TICKET_AUTO_ASSIGNED,
      title: `${key} was routed to you`,
      body: ticket.title,
      link: `/tickets/${ticket.id}`,
      entityType: 'ticket',
      entityId: ticket.id,
      dedupeKey: `routing:assigned:${ticket.id}:${userId}`,
      recipients: await this.recipients.member(ticket.organizationId, userId),
    });
  }

  /** The acknowledgement window ran out. The assignee hears first; the managers hear too. */
  async acknowledgementOverdue(
    ticket: TicketSummaryRow,
    attempt: number,
    assigneeId: string | null,
  ): Promise<void> {
    const key = ticketKey(ticket);
    const managers = await this.recipients.withPermission(
      ticket.organizationId,
      PERMISSIONS.SUPPORT_ROUTING_MANAGE,
    );
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.TICKET_ACK_OVERDUE,
      title: `${key} has not been acknowledged`,
      body: ticket.title,
      link: `/tickets/${ticket.id}`,
      entityType: 'ticket',
      entityId: ticket.id,
      dedupeKey: `routing:ack-overdue:${ticket.id}:${attempt}`,
      recipients: [
        ...(await this.recipients.member(ticket.organizationId, assigneeId)),
        ...managers,
      ],
    });
  }

  async reassigned(
    ticket: TicketSummaryRow,
    toUserId: string,
    byUserId: string | null,
    reason: string,
  ): Promise<void> {
    const key = ticketKey(ticket);
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.TICKET_REASSIGNED,
      title: `${key} is now yours`,
      body: reason,
      link: `/tickets/${ticket.id}`,
      entityType: 'ticket',
      entityId: ticket.id,
      dedupeKey: `routing:reassigned:${ticket.id}:${toUserId}`,
      recipients: await this.recipients.member(ticket.organizationId, toUserId),
      // Nobody is told about their own action.
      excludeUserId: byUserId,
    });
  }

  async escalated(ticket: TicketSummaryRow, level: number, toUserId: string | null): Promise<void> {
    const key = ticketKey(ticket);
    const managers = await this.recipients.withPermission(
      ticket.organizationId,
      PERMISSIONS.SUPPORT_ROUTING_MANAGE,
    );
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.TICKET_ESCALATED,
      title: `${key} escalated`,
      body: ticket.title,
      link: `/tickets/${ticket.id}`,
      entityType: 'ticket',
      entityId: ticket.id,
      dedupeKey: `routing:escalated:${ticket.id}:${level}`,
      recipients: [...(await this.recipients.member(ticket.organizationId, toUserId)), ...managers],
    });
  }

  /**
   * Nobody could take it.
   *
   * This is the notification that must never be missed, which is why `TICKET_UNROUTABLE` is one of
   * the urgent types that ignore quiet hours: a client's problem with no owner is the one failure
   * mode where waiting until morning is the wrong answer.
   */
  async unroutable(
    ticket: TicketSummaryRow,
    reason: string,
    fallbackUserId: string | null,
  ): Promise<void> {
    const key = ticketKey(ticket);
    const managers = await this.recipients.withPermission(
      ticket.organizationId,
      PERMISSIONS.SUPPORT_ROUTING_MANAGE,
    );
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.TICKET_UNROUTABLE,
      title: `${key} could not be routed`,
      body: reason,
      link: `/tickets/${ticket.id}`,
      entityType: 'ticket',
      entityId: ticket.id,
      dedupeKey: `routing:unroutable:${ticket.id}:${reason}`,
      recipients: [
        ...managers,
        ...(await this.recipients.member(ticket.organizationId, fallbackUserId)),
      ],
    });
  }
}
