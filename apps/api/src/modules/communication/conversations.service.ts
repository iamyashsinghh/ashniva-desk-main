import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  COMMUNICATION_ACTION,
  COMMUNICATION_REFUSAL,
  CONVERSATION_KIND,
  CONVERSATION_MEMBERSHIP,
  PAIR_MEMBERSHIP_KINDS,
  PERMISSIONS,
  administersGroup,
  canUsePersonalChat,
  membershipOf,
  type AuthenticatedUser,
  type ConversationAbilities,
  type ConversationDetail,
  type ConversationKind,
  type ConversationMemberRole,
  type ConversationSummary,
  type ProjectMemberRole,
} from '@ashniva/types';

import {
  CommunicationPolicyService,
  assertInternalActor,
  type CommunicationContext,
} from './communication-policy.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { TaskChatScopeService, taskChatWhere } from '../tasks/task-chat-scope.service';
import type { TaskScope } from '../tasks/task-visibility.service';
import { CommunicationFactsService } from './communication-facts.service';
import { ConversationMembersRepository } from './conversation-members.repository';
import { CommunicationRealtimeService } from './communication-realtime.service';
import { ConversationAnchorService } from './conversation-anchor.service';
import { anchorKeyFor, toConversationDetail, toConversationSummary } from './communication.mapper';
import { ConversationsRepository, type ConversationRow } from './conversations.repository';
import type { CreateConversationDto, ListConversationsQueryDto } from './dto/communication.dto';

/**
 * Conversations: opening them, listing them, and saying what may be done in each.
 *
 * Two habits run through this file and are worth naming.
 *
 * **The anchor decides the project, never the caller.** A task conversation takes its project
 * from the task; a ticket conversation from the ticket. Accepting a `projectId` alongside one
 * would be accepting an answer the caller does not get to give, and that is precisely how a
 * caller reaches a project they are not on.
 *
 * **Every list is filtered through the policy after it is read.** The member rows make the query
 * cheap; they never make it authorized. A conversation whose project the caller has left simply
 * stops appearing, with no row deleted anywhere.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly conversations: ConversationsRepository,
    private readonly members: ConversationMembersRepository,
    private readonly policy: CommunicationPolicyService,
    private readonly facts: CommunicationFactsService,
    private readonly anchors: ConversationAnchorService,
    private readonly realtime: CommunicationRealtimeService,
    private readonly auditLog: AuditLogService,
    private readonly taskChatScope: TaskChatScopeService,
  ) {}

  /**
   * Open a conversation, creating it the first time.
   *
   * Idempotent by the unique index on the anchor: two people opening a task's discussion at the
   * same moment get the same thread, because the loser of the insert re-reads instead of making
   * a second one nobody would ever see.
   */
  async open(actor: AuthenticatedUser, dto: CreateConversationDto): Promise<ConversationDetail> {
    const anchor = await this.anchors.resolve(actor, dto);
    await this.policy.require(actor, COMMUNICATION_ACTION.CREATE, anchor.context);

    const anchorKey = anchorKeyFor(anchor.key);
    const existing = await this.conversations.findByAnchor(actor.organizationId, anchorKey);
    const row =
      existing ??
      (await this.conversations.create({
        organizationId: actor.organizationId,
        projectId: anchor.key.projectId,
        kind: anchor.key.kind,
        taskId: anchor.key.taskId ?? null,
        ticketId: anchor.key.ticketId ?? null,
        directKey: anchor.key.directKey ?? null,
        // The one non-null column the unique index rests on. Losing the race here returns null
        // and the line below re-reads the thread the winner made.
        anchorKey,
        title: dto.title ?? null,
        createdById: actor.userId,
      })) ??
      (await this.conversations.findByAnchor(actor.organizationId, anchorKey));

    if (!row) {
      throw new BadRequestException('The conversation could not be opened');
    }

    if (!existing) {
      await this.audit(actor, AUDIT_ACTION.CONVERSATION_CREATED, row, {
        kind: row.kind,
        projectId: row.projectId,
        withUserId: dto.withUserId ?? null,
      });
    }

    // A member row for whoever opened it, and for the other person of a direct conversation. It
    // is a read cursor and a hint — the policy is what admits either of them.
    await this.members.ensureMember(actor.organizationId, row.id, actor.userId);
    if (anchor.key.directKey && dto.withUserId) {
      await this.members.ensureMember(actor.organizationId, row.id, dto.withUserId);
      if (!existing) {
        await this.audit(actor, AUDIT_ACTION.CONVERSATION_PARTICIPANT_ADDED, row, {
          userId: dto.withUserId,
          projectId: row.projectId,
        });
      }
    }

    return this.detail(actor, row.id);
  }

  async detail(actor: AuthenticatedUser, id: string): Promise<ConversationDetail> {
    const row = await this.load(actor, id);
    const context = this.contextOf(row, actor.userId);
    const decision = await this.policy.require(actor, COMMUNICATION_ACTION.READ, context);

    if (decision.viaOversight) {
      await this.audit(actor, AUDIT_ACTION.CONVERSATION_INSPECTED, row, { scope: 'conversation' });
    } else if (row.projectId !== null) {
      // Only where a member row is a read cursor. On a scope conversation the row *is* the
      // membership, and the read above already proved there is one — creating one here would turn
      // reading into joining, which is the exact failure the listed kinds have to avoid.
      await this.members.ensureMember(actor.organizationId, row.id, actor.userId);
    }

    const [unread, previews, abilities, roles] = await Promise.all([
      this.conversations.unreadCounts(actor.userId, [row]),
      this.conversations.previews([row.id]),
      this.abilitiesFor(actor, row),
      this.rolesOf(row),
    ]);

    return toConversationDetail(row, actor.userId, {
      unreadCount: unread.get(row.id) ?? 0,
      preview: previews.get(row.id),
      abilities,
      roles,
    });
  }

  async list(
    actor: AuthenticatedUser,
    query: ListConversationsQueryDto,
  ): Promise<ConversationSummary[]> {
    assertInternalActor(actor);
    // The task-chat predicate goes into the query rather than being applied to its result. A
    // project's task threads the caller has no place in would otherwise fill the `limit` rows this
    // takes in recency order and push the caller's own conversations off the end — the list would
    // be correct and empty, which is the wrong kind of correct.
    // Resolved once and used twice: as the predicate the page is built with, and as the facts the
    // policy re-checks each row against below. Two uses of one snapshot, not two snapshots.
    const taskChatScope = await this.taskChatScope.resolve(actor);
    const kind = peopleInboxKindFor(actor, query);
    if (kind === null) {
      return [];
    }
    const rows = await this.conversations.listFor(actor.organizationId, actor.userId, {
      projectId: query.projectId,
      ...(kind ? { kind } : {}),
      limit: query.limit ?? 50,
      taskScope: taskChatWhere(taskChatScope),
    });

    // The filter that matters: every row is re-checked against the live relationship, so leaving
    // a project empties its conversations out of the list without anything being deleted.
    const visible = await this.filterVisible(actor, rows, taskChatScope);
    const [unread, previews] = await Promise.all([
      this.conversations.unreadCounts(actor.userId, visible),
      this.conversations.previews(visible.map((row) => row.id)),
    ]);

    const summaries = visible.map((row) =>
      toConversationSummary(row, actor.userId, {
        unreadCount: unread.get(row.id) ?? 0,
        preview: previews.get(row.id),
      }),
    );
    return query.unreadOnly ? summaries.filter((row) => row.unreadCount > 0) : summaries;
  }

  async markRead(actor: AuthenticatedUser, id: string): Promise<void> {
    const row = await this.load(actor, id);
    await this.policy.require(actor, COMMUNICATION_ACTION.READ, this.contextOf(row, actor.userId));
    if (row.projectId !== null) {
      await this.members.ensureMember(actor.organizationId, row.id, actor.userId);
    }
    const readAt = new Date();
    await this.members.markRead(row.id, actor.userId, readAt);
    // To this person's own other devices, and nowhere else. See `CommunicationRealtimeService`.
    this.realtime.readUpdated(row, actor.userId, readAt);
  }

  /** Loads a conversation, or reports it missing. Never 403 for an id outside the tenant. */
  async load(actor: AuthenticatedUser, id: string): Promise<ConversationRow> {
    const row = await this.conversations.find(actor.organizationId, id);
    if (!row) {
      // 404 rather than 403 for anything outside the caller's tenant, so a conversation cannot be
      // proved to exist by asking for it.
      throw new NotFoundException('Conversation not found');
    }
    return row;
  }

  /**
   * The policy context for an existing conversation.
   *
   * The branch is taken on `projectId`, which comes from the row: a conversation with a project is
   * described exactly as it was before the scope kinds existed, and one without gets the member
   * facts instead. Nothing the caller sends reaches this decision.
   */
  contextOf(row: ConversationRow, viewerId: string): CommunicationContext {
    const counterpart = PAIR_MEMBERSHIP_KINDS.includes(row.kind as ConversationKind)
      ? row.members.find((member) => member.userId !== viewerId)?.userId
      : undefined;

    if (row.projectId === null) {
      const mine = row.members.find((member) => member.userId === viewerId);
      const membership =
        membershipOf(row.kind as ConversationKind) === CONVERSATION_MEMBERSHIP.LISTED
          ? 'LISTED'
          : 'PAIR';
      return {
        projectId: null,
        taskId: row.taskId,
        ticketId: row.ticketId,
        ...(counterpart ? { withUserId: counterpart } : {}),
        scope: {
          membership,
          isListedMember: mine !== undefined && mine.leftAt === null,
          memberRole: mine ? (mine.role as ConversationMemberRole) : null,
          // Only the person who opened the pair carries the re-check: they are the one whose
          // management scope justified it and so the only one with anything to lose. Somebody
          // reached by a manager never held the reach and does not lose the thread when the
          // manager's project changes hands.
          ...(counterpart && membership === 'PAIR' && row.createdById === viewerId
            ? { counterpartIds: [counterpart] }
            : {}),
        },
      };
    }

    return {
      projectId: row.projectId,
      taskId: row.taskId,
      ticketId: row.ticketId,
      ...(counterpart ? { withUserId: counterpart } : {}),
    };
  }

  /** What the caller may do here, so a hidden control and a refused request agree. */
  async abilitiesFor(
    actor: AuthenticatedUser,
    row: ConversationRow,
  ): Promise<ConversationAbilities> {
    const [abilities] = await this.abilitiesForMany(actor, [row]);
    return abilities as ConversationAbilities;
  }

  /** The same answers for a page of conversations, with the facts gathered once. */
  async abilitiesForMany(
    actor: AuthenticatedUser,
    rows: readonly ConversationRow[],
  ): Promise<ConversationAbilities[]> {
    const contexts = rows.map((row) => this.contextOf(row, actor.userId));
    const resolvers = await this.policy.resolveMany(actor, contexts);
    return rows.map((row, index) => {
      const resolver = resolvers[index] as (typeof resolvers)[number];
      const post = resolver.decide(COMMUNICATION_ACTION.POST);
      const call = resolver.decide(COMMUNICATION_ACTION.CALL);
      const recording = resolver.decide(COMMUNICATION_ACTION.PLAY_RECORDING);
      // One reason, not three: the screen shows a single line under the composer, and the first
      // refusal in this order is the one worth showing — being unable to post explains more than
      // being unable to call.
      //
      // A call refused because the conversation has no project is left out of it, and that is the
      // same judgement `canPlayRecording` already gets: it is a property of the kind rather than
      // something about this caller, so putting "calls are placed from a project conversation"
      // under the composer of every group would be a permanent notice about a control that is
      // simply not part of a group.
      const explains =
        call.reason === COMMUNICATION_REFUSAL.CALL_NEEDS_PROJECT ? [post] : [post, call];
      const refusal = explains.find((decision) => !decision.allowed);
      const mine = row.members.find((member) => member.userId === actor.userId);
      const listed = mine !== undefined && mine.leftAt === null;
      const isGroup = row.kind === CONVERSATION_KIND.GROUP;
      return {
        canPost: post.allowed,
        canCall: call.allowed,
        canPlayRecording: recording.allowed,
        // Administering is about the conversation rather than about a message in it, so it is not
        // a `canCommunicate` action — but it is still decided here and only here, and the
        // endpoints ask the same two questions rather than trusting this.
        canManage:
          isGroup && listed && administersGroup((mine?.role ?? null) as ConversationMemberRole),
        canLeave: isGroup && listed,
        viaOversight: post.viaOversight || call.viaOversight || recording.viaOversight,
        reason: refusal?.reason ?? null,
      };
    });
  }

  /**
   * Refuses, and audits the refusal, unless the caller administers this conversation.
   *
   * Administering is not a `canCommunicate` action — it is about the conversation rather than
   * about anything said in it — so it is decided here, once, and every endpoint that changes a
   * group asks this rather than repeating the two conditions. The read decision is taken first so
   * that "you are not an administrator" is never an answer somebody outside the group can get.
   */
  async requireManage(actor: AuthenticatedUser, row: ConversationRow): Promise<void> {
    const context = this.contextOf(row, actor.userId);
    await this.policy.require(actor, COMMUNICATION_ACTION.READ, context);
    const abilities = await this.abilitiesFor(actor, row);
    if (!abilities.canManage) {
      await this.policy.enforce(
        actor,
        { allowed: false, reason: COMMUNICATION_REFUSAL.NOT_GROUP_ADMIN, viaOversight: false },
        COMMUNICATION_ACTION.ADD_PARTICIPANT,
        context,
      );
    }
  }

  /**
   * Keeps only the conversations the caller may still read.
   *
   * The same decision as before, for the same rows, in a bounded number of queries instead of
   * three to five per row. Fifty conversations used to be two hundred sequential round trips
   * before the list had been mapped at all.
   */
  async filterVisible(
    actor: AuthenticatedUser,
    rows: readonly ConversationRow[],
    taskChatScope?: TaskScope,
  ): Promise<ConversationRow[]> {
    if (rows.length === 0) {
      return [];
    }
    const contexts = rows.map((row) => this.contextOf(row, actor.userId));
    const resolvers = await this.policy.resolveMany(actor, contexts, taskChatScope);
    return rows.filter((_, index) => {
      const decision = (resolvers[index] as (typeof resolvers)[number]).decide(
        COMMUNICATION_ACTION.READ,
      );
      // Oversight does not silently widen somebody's own conversation list; inspecting is its own
      // surface, with its own audit trail.
      return decision.allowed && !decision.viaOversight;
    });
  }

  /** The participants' project roles, in one query rather than one per person. */
  private async rolesOf(row: ConversationRow): Promise<Map<string, ProjectMemberRole>> {
    return this.facts.projectRoles(
      row.projectId,
      row.members.map((member) => member.userId),
    );
  }

  private audit(
    actor: AuthenticatedUser,
    action: string,
    row: ConversationRow,
    after: Record<string, unknown>,
  ): Promise<void> {
    return this.auditLog.record({
      action,
      entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
      entityId: row.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after,
    });
  }
}

/**
 * What the people inbox may ask the list for.
 *
 * Developers and the other non-management roles only post in the project team group, so a page
 * of direct messages they cannot read must not spend the `limit` and push that group off the
 * end. `null` is "this chip has nothing for you": they asked for Direct, and Direct is not
 * theirs. Project, task and ticket lists are unchanged — those hang off a `projectId`.
 */
function peopleInboxKindFor(
  actor: AuthenticatedUser,
  query: ListConversationsQueryDto,
): ConversationKind | undefined | null {
  if (
    query.projectId ||
    canUsePersonalChat(actor.roleKey) ||
    actor.permissions.includes(PERMISSIONS.CONVERSATION_REACH_ORGANIZATION)
  ) {
    return query.kind;
  }
  if (query.kind && query.kind !== CONVERSATION_KIND.GROUP) {
    return null;
  }
  return CONVERSATION_KIND.GROUP;
}
