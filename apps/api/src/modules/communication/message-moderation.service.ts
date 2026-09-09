import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  COMMUNICATION_ACTION,
  type AuthenticatedUser,
  type MessageRevisionSummary,
  type MessageSummary,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { CommunicationRealtimeService } from './communication-realtime.service';
import { ConversationAudienceService } from './conversation-audience.service';
import { ConversationMentionsService } from './conversation-mentions.service';
import { toMessageRevisionSummary, toMessageSummary } from './communication.mapper';
import { abilitiesOf, authorshipOf } from './message-abilities';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import type { EditMessageDto } from './dto/communication.dto';

/**
 * Changing a message after it has been sent, and taking one back.
 *
 * Three decisions are worth stating, because the design document was silent on all three and the
 * quiet defaults are all wrong.
 *
 * **An edit is bounded by the same relationship a post is.** The rule is not "the sender may edit
 * their own message" but "the sender may edit their own message *while they could still post
 * here*", asked of `canCommunicate` with `EDIT`. A developer removed from the project this morning
 * cannot rewrite what they wrote yesterday: losing the relationship loses the ability to change
 * the record of it, which is the same property the rest of this package rests on.
 *
 * **An edit keeps what it replaced.** The window is fifteen minutes, not zero, so a colleague may
 * already have read and acted on the words being replaced. The previous body goes to
 * `message_revisions` — under the same tenancy, the same row-level policy and the same retention
 * as the message — rather than into an audit payload, because a message body in an audit payload
 * is exactly the second, differently-governed copy this module already refuses to make.
 *
 * **A delete is soft, and takes the attachments with it.** The row keeps its place so the thread
 * still reads correctly and the mapper renders a tombstone; the attached files are soft-deleted
 * in the same transaction, because a blanked-out attachment list here plus a working download in
 * the files module is not a deletion, it is a hidden one.
 *
 * Both writes are conditional on the row still being the one the decision was made about, and a
 * `409` is the answer when it is not. The window between reading a message and rewriting it is
 * small and it is not empty: two tabs of the same sender, or a sender and an inspector, both get
 * that far. A revision trail that loses an edit precisely when two people are editing is a
 * revision trail that fails at the only moment it was needed.
 */
@Injectable()
export class MessageModerationService {
  constructor(
    private readonly conversations: ConversationsRepository,
    private readonly conversationsService: ConversationsService,
    private readonly policy: CommunicationPolicyService,
    private readonly realtime: CommunicationRealtimeService,
    private readonly audience: ConversationAudienceService,
    private readonly mentions: ConversationMentionsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async edit(
    actor: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    dto: EditMessageDto,
  ): Promise<MessageSummary> {
    const { row, message, resolver, context, now } = await this.loadTarget(
      actor,
      conversationId,
      messageId,
    );
    await this.policy.enforce(
      actor,
      resolver.decide(COMMUNICATION_ACTION.EDIT, authorshipOf(message, actor.userId, now)),
      COMMUNICATION_ACTION.EDIT,
      context,
    );

    const body = dto.body.trim();
    // The same check the send path makes, because an edit that could introduce a mention a send
    // would have refused is the same hole reached by a second request.
    await this.mentions.assertMentionsAreReachable(actor, row, body);
    if (body === message.body) {
      // Nothing changed. Writing a revision for a save that altered nothing would fill the record
      // with copies of itself and make `editedAt` lie about a message nobody touched.
      return toMessageSummary(message, abilitiesOf(resolver, message, actor.userId, now));
    }

    const updated = await this.conversations.editMessage(message, body, actor.userId);
    if (!updated) {
      // Somebody changed the row between the decision and the write — the sender's other tab, or
      // an inspector withdrawing it. Refusing is the honest answer: the caller's copy of the
      // message is stale, and overwriting on top of it would lose whichever edit arrived first
      // with no revision saying it ever existed.
      throw new ConflictException('That message changed while you were editing it');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.CONVERSATION_MESSAGE_EDITED,
      entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
      entityId: row.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      // The identifiers and the shape of the change, never either body. The old one is in
      // `message_revisions` and the new one is in `messages`; both are already governed.
      after: {
        messageId: message.id,
        projectId: row.projectId,
        ageMinutes: authorshipOf(message, actor.userId, now).ageMinutes,
      },
    });

    const audience = await this.audience.forSender(actor, row);
    this.realtime.messageEdited(row, toMessageSummary(updated), audience);
    return toMessageSummary(updated, abilitiesOf(resolver, updated, actor.userId, now));
  }

  async remove(
    actor: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ): Promise<MessageSummary> {
    const { row, message, resolver, context, now } = await this.loadTarget(
      actor,
      conversationId,
      messageId,
    );
    const decision = await this.policy.enforce(
      actor,
      resolver.decide(COMMUNICATION_ACTION.DELETE, authorshipOf(message, actor.userId, now)),
      COMMUNICATION_ACTION.DELETE,
      context,
    );

    const updated = await this.conversations.softDeleteMessage(message);
    if (!updated) {
      // Two withdrawals of one message raced and this one lost. Only the request that actually
      // took the message down gets to say it did, and to leave an audit row claiming it.
      throw new ConflictException('That message has already been withdrawn');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.CONVERSATION_MESSAGE_DELETED,
      entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
      entityId: row.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: {
        messageId: message.id,
        projectId: row.projectId,
        senderId: message.senderId,
        // Somebody removing a colleague's words is the case an audit trail exists for, so the
        // record says which of the two kinds of deletion this was rather than leaving it to be
        // inferred from comparing the actor to the sender.
        viaOversight: decision.viaOversight,
        attachmentIds: message.attachments.map((file) => file.id),
      },
    });

    const audience = await this.audience.forSender(actor, row);
    this.realtime.messageDeleted(row, toMessageSummary(updated), audience);
    return toMessageSummary(updated, abilitiesOf(resolver, updated, actor.userId, now));
  }

  /**
   * What a message said before each of its edits.
   *
   * Oversight only, and audited like every other inspection. The revisions exist so that an edit
   * cannot quietly rewrite what somebody relied on; making them readable by the thread at large
   * would turn a safeguard into a way to read a typo somebody corrected before anybody saw it.
   */
  async revisions(
    actor: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ): Promise<MessageRevisionSummary[]> {
    const row = await this.conversationsService.load(actor, conversationId);
    await this.policy.require(actor, COMMUNICATION_ACTION.INSPECT, {
      projectId: row.projectId,
      taskId: row.taskId,
      ticketId: row.ticketId,
    });
    const message = await this.conversations.messageById(row.id, messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.CONVERSATION_INSPECTED,
      entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
      entityId: row.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { scope: 'revisions', messageId, projectId: row.projectId },
    });
    const revisions = await this.conversations.revisionsOf(message.id);
    return revisions.map(toMessageRevisionSummary);
  }

  /**
   * The conversation, the message and the facts a decision needs, in one place.
   *
   * The message is looked up *within* the conversation, so an id belonging to another thread is
   * a 404 rather than something the policy then has to refuse — the caller must not be able to
   * establish that a message exists somewhere else by naming it here.
   *
   * **The read decision is taken before the message is fetched at all**, which is what stops the
   * 404 being an oracle. Looking it up first answers a developer three distinguishable ways about
   * a thread on somebody else's project — 404 for an id that is not in it, "this message cannot be
   * changed" for a system note or a tombstone, "only the person who wrote it" for a live one —
   * and each of those is a fact about a conversation they were never admitted to. Refusing the
   * read first makes all three the same answer. One resolver serves both decisions: the facts of
   * one conversation do not change between two questions asked about it in the same request.
   */
  private async loadTarget(actor: AuthenticatedUser, conversationId: string, messageId: string) {
    const row = await this.conversationsService.load(actor, conversationId);
    const context = this.conversationsService.contextOf(row, actor.userId);
    const resolver = await this.policy.resolve(actor, context);
    await this.policy.enforce(
      actor,
      resolver.decide(COMMUNICATION_ACTION.READ),
      COMMUNICATION_ACTION.READ,
      context,
    );
    const message = await this.conversations.messageById(row.id, messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return { row, message, resolver, context, now: new Date() };
  }
}
