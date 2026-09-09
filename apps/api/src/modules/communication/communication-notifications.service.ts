import { Injectable } from '@nestjs/common';
import {
  NOTIFICATION_TYPE,
  PAIR_MEMBERSHIP_KINDS,
  mentionsIn,
  type AuthenticatedUser,
  type ConversationKind,
  type MessageSummary,
} from '@ashniva/types';

import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import type { ConversationRow } from './conversations.repository';
import { conversationLink, conversationName } from './communication-links';
import { messagePreview } from './message-preview';

/**
 * Telling people about messages and calls, through the dispatcher that already exists.
 *
 * Nothing here sends anything itself: preferences, de-duplication, grouping, quiet hours and rate
 * limiting are the dispatcher's job, and a second delivery path would have its own opinion about
 * every one of those. What this file owns is *who* hears and what the line says.
 *
 * The audience is passed in rather than computed here, and deliberately: it is the same list the
 * realtime fan-out used, recomputed from live project membership a moment earlier. Working it out
 * twice would be two chances to disagree about who is still on the project.
 */
@Injectable()
export class CommunicationNotificationsService {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  /**
   * A message arrived.
   *
   * Direct conversations notify; the shared kinds do not, unless somebody was mentioned. A
   * project channel — or a group — that pinged everyone on every line would be turned off within
   * a day, and a notification people turn off is worse than none.
   */
  async messagePosted(
    row: ConversationRow,
    message: MessageSummary,
    sender: AuthenticatedUser,
    audience: readonly string[],
  ): Promise<void> {
    const mentioned = mentionsIn(message.body);
    // Both direct kinds notify: a message addressed to one person is addressed to them whether the
    // relationship behind it is a shared project or a management one. A **group** deliberately
    // does not, and is treated like a project channel — a thread that pings everybody on every
    // line is a thread people switch off, and a notification people switch off is worse than none.
    const isDirect = PAIR_MEMBERSHIP_KINDS.includes(row.kind as ConversationKind);

    if (isDirect) {
      await this.dispatcher.notify({
        type: NOTIFICATION_TYPE.CONVERSATION_MESSAGE,
        title: `${message.sender?.name ?? 'Somebody'} messaged you`,
        body: messagePreview(message.body, message.attachments),
        link: conversationLink(row),
        entityType: 'conversation',
        entityId: row.id,
        // Per message, so a conversation notifies again when the next one arrives, and per
        // recipient is handled by the dispatcher.
        dedupeKey: `conversation:message:${message.id}`,
        recipients: await this.recipients.members(row.organizationId, [...audience]),
      });
      return;
    }

    if (mentioned.length === 0) {
      return;
    }
    // A mention is a direct address inside a shared thread, so it notifies where the thread
    // itself does not — but only the people who are already entitled to receive the message.
    const named = audience.filter((userId) => mentioned.includes(userId));
    if (named.length === 0) {
      return;
    }
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.CONVERSATION_MENTION,
      title: `${message.sender?.name ?? 'Somebody'} mentioned you in ${conversationName(row)}`,
      body: messagePreview(message.body, message.attachments),
      link: conversationLink(row),
      entityType: 'conversation',
      entityId: row.id,
      dedupeKey: `conversation:mention:${message.id}`,
      recipients: await this.recipients.members(row.organizationId, named),
    });
  }

  /** Somebody is being rung from a conversation. */
  async incomingCall(
    row: ConversationRow,
    targetUserId: string,
    callId: string,
    fromName: string,
  ): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.SUPPORT_CALL_INCOMING,
      title: `${fromName} is calling you`,
      body: conversationName(row),
      link: conversationLink(row),
      entityType: 'conversation',
      entityId: row.id,
      dedupeKey: `conversation:call:${callId}:${targetUserId}`,
      recipients: await this.recipients.member(row.organizationId, targetUserId),
    });
  }

  /**
   * The call reached nobody.
   *
   * Told to whoever started it rather than to a support queue. An internal call that fails is
   * their problem to solve — routing it onward is exactly what package 9b must not do.
   */
  async missedCall(
    row: ConversationRow,
    initiatorId: string,
    callId: string,
    reason: string,
  ): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.SUPPORT_CALL_MISSED,
      title: 'Your call reached nobody',
      body: reason,
      link: conversationLink(row),
      entityType: 'conversation',
      entityId: row.id,
      dedupeKey: `conversation:call-missed:${callId}`,
      recipients: await this.recipients.member(row.organizationId, initiatorId),
    });
  }
}
