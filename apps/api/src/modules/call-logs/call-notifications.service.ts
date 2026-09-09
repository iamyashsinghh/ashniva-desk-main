import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPE, PERMISSIONS } from '@ashniva/types';

import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import { ticketKey } from '../tickets/tickets.mapper';
import type { TicketSummaryRow } from '../tickets/tickets.repository';
import type { CallRow } from './call-logs.repository';

/**
 * The two things anybody needs to be told about a support call.
 *
 * Nothing here sends anything itself: preferences, de-duplication, quiet hours and rate limiting
 * are the dispatcher's job. Both types are on the urgent list, which is deliberate — a telephone
 * is ringing right now, and a call nobody answered has stranded somebody who picked up the phone
 * rather than typing. Neither can wait for quiet hours to end.
 *
 * The dedupe keys are per attempt rather than per call, so walking the fallback ladder tells each
 * new destination while never telling the same one twice.
 */
@Injectable()
export class CallNotificationsService {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  /** A destination is being rung. Tell them, so the screen pops before the phone does. */
  async incoming(ticket: TicketSummaryRow, userId: string, call: CallRow): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.SUPPORT_CALL_INCOMING,
      title: `A support call about ${ticketKey(ticket)} is being connected to you`,
      body: ticket.title,
      link: `/tickets/${ticket.id}`,
      entityType: 'ticket',
      entityId: ticket.id,
      dedupeKey: `call:incoming:${call.id}:${call.attemptCount}`,
      recipients: await this.recipients.member(call.organizationId, userId),
    });
  }

  /**
   * The call reached nobody.
   *
   * Goes to whoever manages support routing rather than to a single person, because by definition
   * the people who should have answered did not. This is the notification that makes "a support
   * call is never silently dropped" true rather than merely intended.
   */
  async missed(call: CallRow, reason: string): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.SUPPORT_CALL_MISSED,
      title: 'A support call reached nobody',
      body: reason,
      link: `/tickets/${call.ticketId}`,
      entityType: 'ticket',
      entityId: call.ticketId,
      dedupeKey: `call:missed:${call.id}`,
      recipients: await this.recipients.withPermission(
        call.organizationId,
        PERMISSIONS.SUPPORT_ROUTING_MANAGE,
      ),
    });
  }
}
