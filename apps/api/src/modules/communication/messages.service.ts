import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  COMMUNICATION_ACTION,
  type AuthenticatedUser,
  type MessagePage,
  type MessageSummary,
  type MessageSystemKind,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { ConversationMembersRepository } from './conversation-members.repository';
import { CommunicationNotificationsService } from './communication-notifications.service';
import { CommunicationRealtimeService } from './communication-realtime.service';
import { ConversationAudienceService } from './conversation-audience.service';
import { ConversationMentionsService } from './conversation-mentions.service';
import { toMessageSummary } from './communication.mapper';
import { abilitiesOf } from './message-abilities';
import { UnadoptableAttachmentsError } from './message-attachments';
import {
  ConversationsRepository,
  type ConversationRow,
  type MessageRow,
} from './conversations.repository';
import { ConversationsService } from './conversations.service';
import type { ListMessagesQueryDto, SendMessageDto } from './dto/communication.dto';

/**
 * Reading and writing messages.
 *
 * The read side is ordinary. The write side has three jobs beyond storing a row, and each exists
 * because of a specific way messaging goes wrong:
 *
 *  * **Idempotency.** A flaky connection means a client retries, and a retry that posts a second
 *    copy is the most common bug in every chat ever written. The sender's own id is unique per
 *    conversation, so the second attempt returns the first message.
 *  * **A recomputed audience.** Who is delivered to is worked out from live project membership at
 *    send time, not from the member rows (`ConversationAudienceService`). Somebody removed from
 *    the project this morning does not receive this afternoon's message, and no subscription of
 *    theirs changes that.
 *  * **No body in the audit log.** The message already exists in the messages table; copying it
 *    into an audit payload would make a second, differently-governed copy of everything anybody
 *    ever typed.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly conversations: ConversationsRepository,
    private readonly members: ConversationMembersRepository,
    private readonly conversationsService: ConversationsService,
    private readonly policy: CommunicationPolicyService,
    private readonly realtime: CommunicationRealtimeService,
    private readonly notifications: CommunicationNotificationsService,
    private readonly audience: ConversationAudienceService,
    private readonly mentions: ConversationMentionsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    conversationId: string,
    query: ListMessagesQueryDto,
  ): Promise<MessagePage> {
    const row = await this.conversationsService.load(actor, conversationId);
    const decision = await this.policy.require(
      actor,
      COMMUNICATION_ACTION.READ,
      this.conversationsService.contextOf(row, actor.userId),
    );
    if (decision.viaOversight) {
      await this.auditLog.record({
        action: AUDIT_ACTION.CONVERSATION_INSPECTED,
        entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
        entityId: row.id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        after: { scope: 'messages', projectId: row.projectId },
      });
    }

    const limit = query.limit ?? 50;
    // One more than asked for, so "is there another page" is answered without a second count.
    const rows = await this.conversations.messages(row.id, limit + 1, query.cursor);
    const page = rows.slice(0, limit);
    // One resolver and one clock for the whole page: fifty messages judged against fifty
    // different instants could disagree about where the edit window closes.
    const resolver = await this.policy.resolve(
      actor,
      this.conversationsService.contextOf(row, actor.userId),
    );
    const now = new Date();
    return {
      // Oldest first for display; the query walks backwards so a cursor can page into history.
      items: page
        .map((message) =>
          toMessageSummary(message, abilitiesOf(resolver, message, actor.userId, now)),
        )
        .reverse(),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async send(
    actor: AuthenticatedUser,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageSummary> {
    const row = await this.conversationsService.load(actor, conversationId);
    const context = this.conversationsService.contextOf(row, actor.userId);
    const resolver = await this.policy.resolve(actor, context);
    await this.policy.enforce(
      actor,
      resolver.decide(COMMUNICATION_ACTION.POST),
      COMMUNICATION_ACTION.POST,
      context,
    );

    // A message must carry something, and this is the place that can say so: the rule is about
    // `body` and `attachmentIds` together, and a validator on either property alone cannot express
    // "unless the other one is filled in" without giving up that property's own checks. It is the
    // same reason `CreateConversationDto` leaves "which identifier this kind needs" to
    // `ConversationAnchorService`. After the policy, so somebody who may not post here is told that
    // rather than being handed a shape rule for a conversation they cannot write to.
    const body = dto.body ?? '';
    // Distinct, because adoption is counted: the same id twice would be two requested and one
    // adopted, and the send would be refused for a file that did in fact attach.
    const attachmentIds = [...new Set(dto.attachmentIds ?? [])];
    if (body.length === 0 && attachmentIds.length === 0) {
      throw new BadRequestException('A message needs words, or a file to send instead');
    }

    // Before the row is written, not after: a forged id that reaches the messages table is in the
    // record for every renderer that resolves mentions, whatever the notification path then
    // decides to do with it.
    await this.mentions.assertMentionsAreReachable(actor, row, body);

    if (dto.clientMessageId) {
      const existing = await this.conversations.findMessage(row.id, dto.clientMessageId);
      if (existing) {
        // The retry of a send that already landed. Returning the first message is what makes a
        // dropped response safe to retry rather than a way to say everything twice.
        return toMessageSummary(
          existing,
          abilitiesOf(resolver, existing, actor.userId, new Date()),
        );
      }
    }

    const created =
      (await this.writeMessage(
        {
          organizationId: actor.organizationId,
          conversationId: row.id,
          projectId: row.projectId,
          senderId: actor.userId,
          // Already trimmed by the DTO; an attachment-only message stores the empty string it
          // arrived as, and the preview describes it by its files instead.
          body,
          clientMessageId: dto.clientMessageId ?? null,
        },
        attachmentIds,
      )) ??
      // Lost the race on the sender's own id: somebody else's copy of this very send won, so
      // read it back rather than raising an error for a request that in fact succeeded.
      (dto.clientMessageId
        ? await this.conversations.findMessage(row.id, dto.clientMessageId)
        : null);

    if (!created) {
      throw new BadRequestException('The message could not be sent');
    }

    if (row.projectId !== null) {
      // A read cursor for a project-anchored thread. A scope conversation's member row is its
      // membership and the post decision already proved there is one.
      await this.members.ensureMember(actor.organizationId, row.id, actor.userId);
    }
    if (created.attachments.length > 0) {
      await this.auditLog.record({
        action: AUDIT_ACTION.CONVERSATION_ATTACHMENT_SHARED,
        entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
        entityId: row.id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        // The files, not the message. The body is already in the messages table and does not
        // need a second home with different retention.
        after: {
          projectId: row.projectId,
          fileIds: created.attachments.map((file) => file.id),
        },
      });
    }

    const audience = await this.audience.forSender(actor, row);
    // The fan-out payload carries no abilities: every recipient would get a different answer and
    // none of them is the sender. Their client refetches, which asks the question properly.
    this.realtime.messagePosted(row, toMessageSummary(created), audience);
    const summary = toMessageSummary(
      created,
      abilitiesOf(resolver, created, actor.userId, new Date()),
    );
    await this.notifications.messagePosted(row, summary, actor, audience);
    return summary;
  }

  /**
   * The write, with the one failure that has to be explained rather than swallowed.
   *
   * Adoption used to be a filtered `updateMany` whose count nobody read, so a file that was not
   * the sender's to attach — someone else's upload, an id that matches nothing, one already
   * carried by a task or an earlier message — was dropped without a word. The message posted; the
   * attachment did not. Once a message could *be* a file, the same drop wrote a row with neither
   * words nor attachments and handed the conversation list an empty preview and the notification
   * an empty line.
   *
   * The refusal names the actual problem, because "the message could not be sent" would send
   * somebody looking at their connection for a file that was never theirs to send.
   */
  private async writeMessage(
    data: Parameters<ConversationsRepository['addMessage']>[0],
    attachmentIds: readonly string[],
  ): Promise<MessageRow | null> {
    try {
      return await this.conversations.addMessage(data, attachmentIds);
    } catch (cause) {
      if (cause instanceof UnadoptableAttachmentsError) {
        throw new BadRequestException(
          attachmentIds.length === 1
            ? 'That file could not be attached: it is not yours to send, or it is already attached to something else. Nothing was posted.'
            : 'One of those files could not be attached: it is not yours to send, or it is already attached to something else. Nothing was posted.',
        );
      }
      throw cause;
    }
  }

  /** Writes the system's own note into the thread — a call starting, a call ending. */
  async writeSystemMessage(
    row: ConversationRow,
    systemKind: MessageSystemKind,
    body: string,
  ): Promise<MessageSummary | null> {
    const created = await this.conversations.addMessage(
      {
        organizationId: row.organizationId,
        conversationId: row.id,
        projectId: row.projectId,
        senderId: null,
        body,
        systemKind,
      },
      [],
    );
    if (!created) {
      return null;
    }
    const summary = toMessageSummary(created);
    const audience = await this.audience.userIds(row);
    this.realtime.messagePosted(row, summary, audience);
    return summary;
  }
}
