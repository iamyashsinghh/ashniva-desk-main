import { Injectable } from '@nestjs/common';
import {
  CONVERSATION_KIND,
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
   * Direct conversations and groups notify on every line, the way a phone chat does: both are
   * made of people who chose to talk to each other. The derived kinds — a project channel, a task
   * or ticket thread — notify only somebody mentioned or replied to; those are everybody on the
   * work, and a channel that pinged all of them on every line would be switched off within a day.
   */
  async messagePosted(
    row: ConversationRow,
    message: MessageSummary,
    sender: AuthenticatedUser,
    audience: readonly string[],
  ): Promise<void> {
    const mentioned = mentionsIn(message.body);
    const senderName = message.sender?.name ?? 'Somebody';
    const preview = messagePreview(message.body, message.attachments);
    const isDirect = PAIR_MEMBERSHIP_KINDS.includes(row.kind as ConversationKind);

    if (isDirect) {
      await this.dispatcher.notify({
        type: NOTIFICATION_TYPE.CONVERSATION_MESSAGE,
        title: senderName,
        body: preview,
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

    // A mention is a direct address inside a shared thread, so it notifies where the thread
    // itself does not — but only the people who are already entitled to receive the message.
    const named = audience.filter((userId) => mentioned.includes(userId));
    const answered = message.replyTo?.sender?.id;
    const addressed = new Set([...named, ...(answered ? [answered] : [])]);

    // Everybody else in a group hears the line itself; the people it addresses hear it as that,
    // below, and not twice.
    if (row.kind === CONVERSATION_KIND.GROUP) {
      const others = audience.filter((userId) => !addressed.has(userId));
      if (others.length > 0) {
        await this.dispatcher.notify({
          type: NOTIFICATION_TYPE.CONVERSATION_MESSAGE,
          title: conversationName(row),
          body: `${senderName}: ${preview}`,
          link: conversationLink(row),
          entityType: 'conversation',
          entityId: row.id,
          dedupeKey: `conversation:message:${message.id}`,
          recipients: await this.recipients.members(row.organizationId, others),
        });
      }
    }
    if (named.length > 0) {
      await this.dispatcher.notify({
        type: NOTIFICATION_TYPE.CONVERSATION_MENTION,
        title: `${senderName} mentioned you in ${conversationName(row)}`,
        body: preview,
        link: conversationLink(row),
        entityType: 'conversation',
        entityId: row.id,
        dedupeKey: `conversation:mention:${message.id}`,
        recipients: await this.recipients.members(row.organizationId, named),
      });
    }

    // Answering somebody's line addresses them as surely as naming them does, so it notifies the
    // same way and under the same guard: only if they are in this message's audience, and only
    // once — somebody both quoted and mentioned has just been told.
    if (
      answered &&
      answered !== sender.userId &&
      audience.includes(answered) &&
      !named.includes(answered)
    ) {
      await this.dispatcher.notify({
        type: NOTIFICATION_TYPE.CONVERSATION_MENTION,
        title: `${senderName} replied to you in ${conversationName(row)}`,
        body: preview,
        link: conversationLink(row),
        entityType: 'conversation',
        entityId: row.id,
        dedupeKey: `conversation:reply:${message.id}`,
        recipients: await this.recipients.member(row.organizationId, answered),
      });
    }
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
