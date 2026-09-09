import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPE, PERMISSIONS, type AuthenticatedUser } from '@ashniva/types';

import { REALTIME_EVENTS } from '../../infrastructure/realtime/realtime-rooms';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { isInternalUser } from '../../common/auth/access-scope';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import type { TicketSummaryRow } from './tickets.repository';

/** Ticket changes reach both the service provider and the requesting client organization. */
@Injectable()
export class TicketEventsService {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  changed(actor: AuthenticatedUser, row: TicketSummaryRow): void {
    const payload = {
      id: row.id,
      projectId: row.projectId,
      status: row.status,
      changedByUserId: actor.userId,
      at: new Date().toISOString(),
    };
    // The provider side goes to the ticket's project, not to every signed-in colleague. The
    // client side keeps the organization room: a client organization is the audience for its own
    // tickets, and its people are not members of the provider's projects.
    this.realtime.emitToProject(
      row.organizationId,
      row.projectId,
      REALTIME_EVENTS.TICKET_UPDATED,
      payload,
    );
    if (row.clientOrganizationId !== row.organizationId) {
      this.realtime.emitToOrganization(
        row.clientOrganizationId,
        REALTIME_EVENTS.TICKET_UPDATED,
        payload,
      );
    }
  }

  /** A raised ticket reaches everyone who triages tickets. */
  async raised(actor: AuthenticatedUser, row: TicketSummaryRow): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.TICKET_NEW,
      title: `New ticket T-${row.number}: ${row.title}`,
      body: `${row.priority} · ${row.clientOrganization.name}`,
      link: `/tickets/${row.id}`,
      entityType: 'ticket',
      entityId: row.id,
      dedupeKey: `ticket-new:${row.id}`,
      recipients: await this.recipients.withPermission(
        row.organizationId,
        PERMISSIONS.TICKET_TRIAGE,
      ),
      excludeUserId: actor.userId,
    });
  }

  /** A public reply goes to the other side: the requester, or the assignee / triage team. */
  async replied(actor: AuthenticatedUser, row: TicketSummaryRow, body: string): Promise<void> {
    const fromProvider = isInternalUser(actor);
    let recipients = await this.recipients.member(row.organizationId, row.assignedToId);
    if (fromProvider) {
      recipients = await this.recipients.member(row.clientOrganizationId, row.requesterId);
    } else if (recipients.length === 0) {
      recipients = await this.recipients.withPermission(
        row.organizationId,
        PERMISSIONS.TICKET_TRIAGE,
      );
    }
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.TICKET_REPLY,
      title: `Reply on T-${row.number}: ${row.title}`,
      body: body.length > 160 ? `${body.slice(0, 157)}…` : body,
      link: fromProvider ? `/portal/tickets/${row.id}` : `/tickets/${row.id}`,
      entityType: 'ticket',
      entityId: row.id,
      groupKey: `ticket-reply:${row.id}`,
      recipients,
      excludeUserId: actor.userId,
    });
  }
}
