import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  COMMUNICATION_ACTION,
  CONVERSATION_KIND,
  CONVERSATION_MEMBER_ROLE,
  MAX_GROUP_MEMBERS,
  type AuthenticatedUser,
  type ConversationMemberRole,
  type ConversationParticipant,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { ConversationMembersRepository } from './conversation-members.repository';
import type { ConversationRow } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import type { AddConversationMemberDto } from './dto/scope.dto';

/**
 * Who is in a group, and the two ways somebody stops being.
 *
 * This file is where the change of contract lives. For every other kind in this module a member
 * row is a read cursor and the project decides who belongs; for a group the row *is* the
 * membership, and a list that is authorization can go stale in a way a derived permission cannot.
 * Three things keep it from doing so, and all three are here:
 *
 *  * **Every addition is re-checked against the adder's live scope**, through the same
 *    `MessagingScopeService` the create and directory endpoints use. Being in a group is not a
 *    licence to bring anybody at all into it — an administrator may add the people *they* reach,
 *    which is why the check is on the actor and not on the group.
 *  * **Leaving is expressible.** `left_at` is set rather than the row being deleted, so a former
 *    member reads nothing from the next request onwards while the thread still renders who said
 *    what. Deleting the row would make "was never here" and "has gone" the same state.
 *  * **Nothing here is decided by the request.** The actor's standing comes from the row, the
 *    target's from the row, and the refusals are audited like every other one in this package.
 */
@Injectable()
export class ConversationMembersService {
  constructor(
    private readonly members: ConversationMembersRepository,
    private readonly conversationsService: ConversationsService,
    private readonly policy: CommunicationPolicyService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Everybody in this conversation, past members included, with their standing. */
  async list(actor: AuthenticatedUser, conversationId: string): Promise<ConversationParticipant[]> {
    const row = await this.conversationsService.load(actor, conversationId);
    const detail = await this.conversationsService.detail(actor, row.id);
    return detail.participants;
  }

  /**
   * Adds somebody to a group.
   *
   * The scope check is the decision and it is made by `canCommunicate` with `ADD_PARTICIPANT`,
   * against the actor's reach resolved a moment earlier. The API refuses; nothing about this is
   * left to a screen not offering the name.
   */
  async add(
    actor: AuthenticatedUser,
    conversationId: string,
    dto: AddConversationMemberDto,
  ): Promise<ConversationParticipant[]> {
    const row = await this.requireGroup(actor, conversationId);
    if (dto.userId === actor.userId) {
      throw new BadRequestException('You are already in this group');
    }
    const context = this.conversationsService.contextOf(row, actor.userId);
    if (!context.scope) {
      // Unreachable: `requireGroup` established that this conversation has no project, which is
      // what makes `contextOf` build a scope. Refused rather than narrowed with a cast, so a later
      // change to either function fails loudly instead of skipping the scope check.
      throw new BadRequestException('Only a group has a member list');
    }
    await this.policy.require(actor, COMMUNICATION_ACTION.ADD_PARTICIPANT, {
      ...context,
      withUserId: dto.userId,
      scope: { ...context.scope, counterpartIds: [dto.userId] },
    });

    const existing = row.members.find((member) => member.userId === dto.userId);
    if (existing && existing.leftAt === null) {
      // Already here. Not an error — two administrators adding the same person is an ordinary
      // race — but not a second row and not a silent change of their standing either.
      return this.list(actor, row.id);
    }
    const active = row.members.filter((member) => member.leftAt === null).length;
    if (active + 1 > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(`A group may hold at most ${MAX_GROUP_MEMBERS} people`);
    }

    await this.members.ensureMember(actor.organizationId, row.id, dto.userId, {
      role: dto.role ?? CONVERSATION_MEMBER_ROLE.MEMBER,
      addedById: actor.userId,
      // Somebody who left and is added back rejoins the row they already have, so the group has
      // one record of their place in it rather than a history of duplicates.
      rejoin: true,
    });
    await this.audit(actor, AUDIT_ACTION.CONVERSATION_PARTICIPANT_ADDED, row.id, {
      userId: dto.userId,
      projectId: null,
      role: dto.role ?? CONVERSATION_MEMBER_ROLE.MEMBER,
      viaScope: true,
    });
    return this.list(actor, row.id);
  }

  /**
   * Takes somebody out of a group.
   *
   * An administrator may remove ordinary members and other administrators; nobody may remove the
   * owner, who leaves by leaving. That asymmetry is deliberate: an administrator who could remove
   * the owner could take a group away from the person who made it, and there is no reason to
   * allow that when the owner can hand the group over by promoting somebody first.
   */
  async remove(
    actor: AuthenticatedUser,
    conversationId: string,
    userId: string,
  ): Promise<ConversationParticipant[]> {
    const row = await this.requireGroup(actor, conversationId);
    if (userId === actor.userId) {
      throw new BadRequestException('Use leave to take yourself out of a group');
    }
    await this.conversationsService.requireManage(actor, row);

    const target = row.members.find((member) => member.userId === userId);
    if (!target || target.leftAt !== null) {
      // The same answer for "never here" and "already gone": a removal that names somebody who is
      // not in the group must not confirm which of the two they are.
      throw new BadRequestException('That person is not in this group');
    }
    if ((target.role as ConversationMemberRole) === CONVERSATION_MEMBER_ROLE.OWNER) {
      throw new ForbiddenException('The owner of a group cannot be removed from it');
    }

    await this.members.markMemberLeft(row.id, userId);
    await this.audit(actor, AUDIT_ACTION.CONVERSATION_PARTICIPANT_REMOVED, row.id, {
      userId,
      byOwnChoice: false,
    });
    return this.list(actor, row.id);
  }

  /**
   * Leaves a group.
   *
   * Available to everybody in one, the owner included: a person cannot be held in a conversation
   * by nobody else being willing to promote them out of it. The group survives an owner leaving —
   * it is a thread with a history, not a thing that belongs to somebody — and the remaining
   * administrators keep administering it.
   */
  async leave(actor: AuthenticatedUser, conversationId: string): Promise<void> {
    const row = await this.requireGroup(actor, conversationId);
    // Reading is what proves they are in it; leaving needs nothing more than being here.
    await this.policy.require(
      actor,
      COMMUNICATION_ACTION.READ,
      this.conversationsService.contextOf(row, actor.userId),
    );
    const left = await this.members.markMemberLeft(row.id, actor.userId);
    if (!left) {
      throw new BadRequestException('You are not in this group');
    }
    await this.audit(actor, AUDIT_ACTION.CONVERSATION_PARTICIPANT_REMOVED, row.id, {
      userId: actor.userId,
      byOwnChoice: true,
    });
  }

  /**
   * The conversation, if it is a group.
   *
   * The read decision comes first, so "that is not a group" is only ever said to somebody who
   * could see the conversation anyway. Membership is what the four routes above change, and only
   * a group has membership to change: a project channel's is derived and a direct message's is
   * two people by definition.
   */
  private async requireGroup(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<ConversationRow> {
    const row = await this.conversationsService.load(actor, conversationId);
    const context = this.conversationsService.contextOf(row, actor.userId);
    await this.policy.require(actor, COMMUNICATION_ACTION.READ, context);
    if (row.kind !== CONVERSATION_KIND.GROUP) {
      throw new BadRequestException('Only a group has a member list');
    }
    return row;
  }

  private audit(
    actor: AuthenticatedUser,
    action: string,
    conversationId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    return this.auditLog.record({
      action,
      entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
      entityId: conversationId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after,
    });
  }
}
