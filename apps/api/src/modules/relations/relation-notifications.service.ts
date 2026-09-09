import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPE, type AuthenticatedUser } from '@ashniva/types';

import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import type { TicketSummaryRow } from '../tickets/tickets.repository';
import { ticketKeyOf } from './relations.mapper';

/**
 * Telling the person who reported a ticket that it is being tracked somewhere else.
 *
 * The requester's own side, not the desk's: whoever raised it is watching it, and after a duplicate
 * is marked their ticket is no longer the one that moves. It goes through the shared dispatcher, so
 * preferences, quiet hours, grouping and rate limits all apply as they do to everything else.
 *
 * The body is the same sentence written on the ticket's activity trail, which is already free of
 * anything the reader may not open: `duplicateCloseNote` names the other ticket only when both
 * belong to the same client.
 */
@Injectable()
export class RelationNotificationsService {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  async duplicateMarked(
    actor: AuthenticatedUser,
    input: { duplicate: TicketSummaryRow; message: string; closed: boolean },
  ): Promise<void> {
    const ticket = input.duplicate;
    const key = ticketKeyOf(ticket);
    const forClient = ticket.clientOrganizationId !== ticket.organizationId;
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.TICKET_DUPLICATE,
      title: `${key} is being tracked on another ticket`,
      body: input.closed
        ? `${input.message}. This ticket has been closed as a duplicate.`
        : input.message,
      link: forClient ? `/portal/tickets/${ticket.id}` : `/tickets/${ticket.id}`,
      entityType: 'ticket',
      entityId: ticket.id,
      // One telling per ticket per day: re-linking after an unlink is a correction, not news.
      dedupeKey: `ticket-duplicate:${ticket.id}`,
      recipients: await this.recipients.member(ticket.clientOrganizationId, ticket.requesterId),
      excludeUserId: actor.userId,
    });
  }
}
