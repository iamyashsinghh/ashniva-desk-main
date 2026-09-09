import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  COMMUNICATION_ACTION,
  CONVERSATION_KIND,
  CONVERSATION_MEMBER_ROLE,
  MAX_GROUP_MEMBERS,
  type AuthenticatedUser,
  type ConversationDetail,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { ConversationMembersRepository } from './conversation-members.repository';
import { anchorKeyFor, directKeyFor } from './communication.mapper';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import type { CreateGroupDto, CreateScopeDirectDto, UpdateConversationDto } from './dto/scope.dto';

/**
 * Starting a conversation that has no project, and changing what a group is called.
 *
 * The three habits of `ConversationsService.open` carry over unchanged and matter more here, not
 * less:
 *
 * **The caller's identifiers are never an answer.** A request names people; this file asks
 * `MessagingScopeService`, through the policy, whether the actor may reach each of them, and the
 * request is refused before a row exists if the answer is no. Every name is checked, not the
 * first one and not a sample.
 *
 * **Identity is the database's to enforce.** A scope direct message is one row per pair for the
 * whole organization — the anchor is the two ids and nothing else — so two people opening one at
 * the same moment get one thread, and the loser of the insert re-reads. A group is deliberately
 * *not* idempotent: two groups of the same people with the same name are two groups, so its anchor
 * carries a random discriminator rather than pretending there is a natural key.
 *
 * **A group's member list is authorization**, which is what makes this the security-critical file
 * of the package. Everybody who ends up on the list got there through a scope check made at the
 * moment they were added — here for the people a group starts with, and in
 * `ConversationMembersService` for everybody added later.
 */
@Injectable()
export class ScopeConversationsService {
  constructor(
    private readonly conversations: ConversationsRepository,
    private readonly members: ConversationMembersRepository,
    private readonly conversationsService: ConversationsService,
    private readonly policy: CommunicationPolicyService,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * The direct message between the actor and one colleague inside their scope.
   *
   * Idempotent by the pair, so "message this person" from a directory opens the thread that
   * already exists rather than making a second one beside it.
   */
  async openDirect(
    actor: AuthenticatedUser,
    dto: CreateScopeDirectDto,
  ): Promise<ConversationDetail> {
    if (dto.userId === actor.userId) {
      throw new BadRequestException('A direct message needs somebody else');
    }
    await this.policy.require(actor, COMMUNICATION_ACTION.CREATE, {
      projectId: null,
      withUserId: dto.userId,
      scope: {
        membership: 'PAIR',
        isListedMember: false,
        memberRole: null,
        counterpartIds: [dto.userId],
      },
    });

    const anchorKey = anchorKeyFor({
      kind: CONVERSATION_KIND.SCOPE_DIRECT,
      directKey: directKeyFor(actor.userId, dto.userId),
    });
    const existing = await this.conversations.findByAnchor(actor.organizationId, anchorKey);
    const row =
      existing ??
      (await this.conversations.create({
        organizationId: actor.organizationId,
        projectId: null,
        kind: CONVERSATION_KIND.SCOPE_DIRECT,
        directKey: directKeyFor(actor.userId, dto.userId),
        anchorKey,
        createdById: actor.userId,
      })) ??
      (await this.conversations.findByAnchor(actor.organizationId, anchorKey));
    if (!row) {
      throw new BadRequestException('The conversation could not be opened');
    }

    if (!existing) {
      await this.audit(actor, AUDIT_ACTION.CONVERSATION_CREATED, row.id, {
        kind: row.kind,
        projectId: null,
        withUserId: dto.userId,
      });
      await this.audit(actor, AUDIT_ACTION.CONVERSATION_PARTICIPANT_ADDED, row.id, {
        userId: dto.userId,
        projectId: null,
        viaScope: true,
      });
    }
    // Not a rejoin: nobody leaves a pair — `leave` is a group route — so the rows either do not
    // exist yet or are already right, and bumping `joined_at` every time somebody re-opens the
    // thread would make the column say when it was last looked at rather than when it began.
    await this.members.ensureMember(actor.organizationId, row.id, actor.userId);
    await this.members.ensureMember(actor.organizationId, row.id, dto.userId, {
      addedById: actor.userId,
    });

    return this.conversationsService.detail(actor, row.id);
  }

  /** A new group, with everybody it starts with checked against the actor's scope first. */
  async createGroup(actor: AuthenticatedUser, dto: CreateGroupDto): Promise<ConversationDetail> {
    const memberIds = [...new Set(dto.memberIds)].filter((userId) => userId !== actor.userId);
    if (memberIds.length === 0) {
      throw new BadRequestException('A group needs somebody besides you in it');
    }
    if (memberIds.length + 1 > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(`A group may hold at most ${MAX_GROUP_MEMBERS} people`);
    }
    // Every name, in one decision. A partial check would make the size of the group the thing
    // that decided whether the rule applied.
    await this.policy.require(actor, COMMUNICATION_ACTION.CREATE, {
      projectId: null,
      scope: {
        membership: 'LISTED',
        isListedMember: false,
        memberRole: null,
        counterpartIds: memberIds,
      },
    });
    const imageFileId = await this.resolveImage(actor, dto.imageFileId ?? null);

    const row = await this.conversations.create({
      organizationId: actor.organizationId,
      projectId: null,
      kind: CONVERSATION_KIND.GROUP,
      title: dto.title.trim(),
      imageFileId,
      // Random rather than derived: two groups of the same people are two groups.
      anchorKey: anchorKeyFor({ kind: CONVERSATION_KIND.GROUP }),
      createdById: actor.userId,
    });
    if (!row) {
      throw new BadRequestException('The group could not be created');
    }

    await this.members.ensureMember(actor.organizationId, row.id, actor.userId, {
      role: CONVERSATION_MEMBER_ROLE.OWNER,
    });
    for (const userId of memberIds) {
      await this.members.ensureMember(actor.organizationId, row.id, userId, {
        addedById: actor.userId,
      });
    }

    await this.audit(actor, AUDIT_ACTION.CONVERSATION_CREATED, row.id, {
      kind: row.kind,
      projectId: null,
      memberIds,
    });
    return this.conversationsService.detail(actor, row.id);
  }

  /**
   * Renaming a group, or changing its picture.
   *
   * `title` was write-once — set when a conversation was opened and never touched again — which
   * was fine while no kind had a name anybody would want to change. A group does. Only a group:
   * a project channel's name is its project's, and a direct message is named after the person.
   */
  async update(
    actor: AuthenticatedUser,
    conversationId: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationDetail> {
    if (dto.title === undefined && dto.imageFileId === undefined) {
      throw new BadRequestException('Nothing to change');
    }
    const row = await this.conversationsService.load(actor, conversationId);
    await this.conversationsService.requireManage(actor, row);

    const imageFileId =
      dto.imageFileId === undefined ? undefined : await this.resolveImage(actor, dto.imageFileId);
    const updated = await this.conversations.updateConversation(row.id, {
      ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
      ...(imageFileId === undefined ? {} : { imageFileId }),
    });
    await this.audit(actor, AUDIT_ACTION.CONVERSATION_UPDATED, updated.id, {
      title: dto.title === undefined ? undefined : updated.title,
      imageFileId: imageFileId === undefined ? undefined : imageFileId,
    });
    return this.conversationsService.detail(actor, updated.id);
  }

  /**
   * The file a group is about to use as its picture, or a refusal.
   *
   * The same ownership rule a message attachment gets: the actor's own upload, in their tenant,
   * not already attached to anything else. Without it a group could adopt a ticket's attachment
   * and show it to people the ticket never admitted.
   */
  private async resolveImage(
    actor: AuthenticatedUser,
    fileId: string | null,
  ): Promise<string | null> {
    if (fileId === null) {
      return null;
    }
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        organizationId: actor.organizationId,
        uploadedById: actor.userId,
        deletedAt: null,
        messageId: null,
        taskId: null,
        ticketId: null,
        commentId: null,
      },
      select: { id: true, contentType: true },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (!file.contentType.startsWith('image/')) {
      throw new BadRequestException('A group picture has to be an image');
    }
    // Forced internal, exactly as a message attachment is. A group has no client-facing parent, so
    // the `files` policy already admits no client to it; setting the flag as well means two
    // independent things would have to fail before a picture of a colleague reached a portal.
    await this.prisma.file.updateMany({
      where: { id: file.id, organizationId: actor.organizationId },
      data: { visibility: 'INTERNAL' },
    });
    return file.id;
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
