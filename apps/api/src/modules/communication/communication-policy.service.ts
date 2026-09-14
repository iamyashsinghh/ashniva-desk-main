import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  COMMUNICATION_REFUSAL,
  COMMUNICATION_REFUSAL_LABELS,
  PERMISSIONS,
  canCommunicate,
  canUsePersonalChat,
  type AuthenticatedUser,
  type CommunicationAction,
  type CommunicationDecision,
  type CommunicationScopeContext,
  type ConversationMemberRole,
  type MessageAuthorship,
  type ProjectMemberRole,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CommunicationFactsService } from './communication-facts.service';
import type { TaskScope } from '../tasks/task-visibility.service';
import {
  CommunicationSettingsService,
  DEFAULT_COMMUNICATION_FLAGS,
  type CommunicationFlags,
} from './communication-settings.service';

/**
 * The facts of a conversation that has no project, as the caller knows them.
 *
 * `counterpartIds` are names, not an answer: the service resolves them against
 * `MessagingScopeService` before anything is decided, exactly as `projectId` is resolved into a
 * live membership rather than believed.
 */
export interface CommunicationScopeInput {
  membership: 'PAIR' | 'LISTED';
  isListedMember: boolean;
  memberRole: ConversationMemberRole | null;
  /** Whoever this action names. Undefined when it names nobody. */
  counterpartIds?: readonly string[];
}

/**
 * The context a decision is made about.
 *
 * Everything here is an *identifier*; the service resolves each one into a live fact before
 * deciding. Nothing a caller supplies is trusted as an answer — a request that names a project
 * still has to prove the actor is on it.
 */
export interface CommunicationContext {
  /**
   * The conversation's project, or null for one of the two scope kinds.
   *
   * Null is not "unknown". It is what selects the scope branch of `canCommunicate`, and it comes
   * from the row rather than from the request: a caller cannot ask for a project-anchored thread
   * to be judged as though it had no project.
   */
  projectId: string | null;
  /** The other person, for a direct conversation or for starting one. */
  withUserId?: string;
  /** Set when the conversation belongs to a task or a ticket, for the audit trail. */
  taskId?: string | null;
  ticketId?: string | null;
  /** Set when, and only when, `projectId` is null. */
  scope?: CommunicationScopeInput;
}

/**
 * The live facts of one conversation, gathered by `resolveMany` and handed to the pure decision.
 *
 * An object rather than eight positional arguments: the list grew a task fact, and a call site
 * reading `(actor, flags, null, undefined, false, true)` is one where the next fact gets put in
 * the wrong slot.
 */
interface ResolvedFacts {
  /** False for a client user, which is decided before any query runs. */
  internal: boolean;
  actorProjectRole?: ProjectMemberRole | null;
  counterpartProjectRole?: ProjectMemberRole | null;
  sharedWorkRelationship?: boolean;
  scope?: CommunicationScopeContext;
  /** Set only for a task-anchored conversation. See `CommunicationInput.taskRelationship`. */
  taskRelationship?: boolean;
}

/**
 * The one authority on who may talk to whom.
 *
 * Every controller, every socket event and the call path asks this service, and it recomputes the
 * relationship from live rows each time: project membership now, role now, the working
 * relationship now, the organization's switches now. **A stored participant list is never
 * consulted as authorization.** That is what makes removing somebody from a project remove their
 * access — the row that recorded their place is a read cursor, and the project membership that
 * justified it is gone.
 *
 * The judgement itself is `canCommunicate` in `packages/types`, which is pure and exhaustively
 * unit-tested. This service's job is to gather the facts honestly and to write down refusals.
 */
@Injectable()
export class CommunicationPolicyService {
  constructor(
    private readonly settings: CommunicationSettingsService,
    private readonly facts: CommunicationFactsService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * The live facts for one conversation, gathered once.
   *
   * A page of fifty messages asks "may I edit this one" fifty times with only the message
   * changing. Re-reading the project role each time would be fifty chances to answer differently
   * within a single response — and fifty queries for one screen. So the facts are resolved once
   * and the pure function is applied to each message against them.
   *
   * The resolver is deliberately short-lived: it is a snapshot for one request, never cached
   * across two, because the whole package rests on yesterday's answer not being today's.
   */
  async resolve(
    actor: AuthenticatedUser,
    context: CommunicationContext,
  ): Promise<CommunicationResolver> {
    const [resolver] = await this.resolveMany(actor, [context]);
    return resolver as CommunicationResolver;
  }

  /**
   * The live facts for many conversations, gathered in a fixed number of queries.
   *
   * The same answers as calling `resolve` in a loop, and that is the whole requirement: this
   * changes how many round trips a decision costs, never what the decision is. It exists because
   * the two list endpoints were asking per row — `GET /conversations` about fifty of them and
   * `GET /conversations/contacts` about five hundred — and each ask was three to five sequential
   * queries. Batched, the cost stops growing with the size of the list.
   *
   * The one deliberate difference is that the shared-work lookup is done only for the pairs whose
   * roles actually consult it (`needsSharedWork`). `resolve` used to fetch it for every pair and
   * then not read it, so the decisions are identical and one query is saved for every pair that
   * was never going to look.
   */
  async resolveMany(
    actor: AuthenticatedUser,
    contexts: readonly CommunicationContext[],
    /**
     * The caller's already-resolved task-chat scope, when it has one.
     *
     * The conversation list resolves it to build its page — the same two queries this would issue —
     * so handing it over saves them without changing a single decision: it is the same snapshot,
     * taken a moment earlier in the same request. Absent, and the scope is resolved here.
     */
    taskChatScope?: TaskScope,
  ): Promise<CommunicationResolver[]> {
    if (contexts.length === 0) {
      return [];
    }
    if (!isInternalUser(actor)) {
      // Resolved without touching the database: a client has no project role to look up, and
      // looking one up would be a query an unauthorized caller could provoke.
      return contexts.map(() =>
        this.resolverFor(actor, DEFAULT_COMMUNICATION_FLAGS, { internal: false }),
      );
    }

    const flags = await this.settings.flagsFor(actor.organizationId);
    const [projectFacts, scopeFacts] = await Promise.all([
      this.facts.projectFactsFor(actor, contexts, taskChatScope),
      this.facts.scopeFactsFor(actor, contexts),
    ]);

    return contexts.map((context) => {
      if (context.scope) {
        return this.resolverFor(actor, flags, {
          internal: true,
          scope: {
            membership: context.scope.membership,
            isListedMember: context.scope.isListedMember,
            memberRole: context.scope.memberRole,
            ...(context.scope.counterpartIds
              ? {
                  counterpartInScope: context.scope.counterpartIds.every((userId) =>
                    scopeFacts.has(userId),
                  ),
                }
              : {}),
          },
        });
      }
      const projectId = context.projectId as string;
      return this.resolverFor(actor, flags, {
        internal: true,
        actorProjectRole: projectFacts.actorRoles.get(projectId) ?? null,
        counterpartProjectRole: context.withUserId
          ? (projectFacts.counterpartRoles.get(`${projectId}:${context.withUserId}`) ?? null)
          : undefined,
        sharedWorkRelationship:
          context.withUserId !== undefined &&
          projectFacts.sharedWork.has(`${projectId}:${context.withUserId}`),
        // Only a conversation that names a task carries the task fact. Left undefined for every
        // other kind, so a project channel, a ticket thread and a direct message are judged by
        // exactly the code that judged them before task chat was narrowed.
        ...(context.taskId
          ? { taskRelationship: projectFacts.relatedTasks.has(context.taskId) }
          : {}),
      });
    });
  }

  /** The decision, without throwing. Used where a refusal has to be rendered rather than raised. */
  async decide(
    actor: AuthenticatedUser,
    action: CommunicationAction,
    context: CommunicationContext,
    message?: MessageAuthorship,
  ): Promise<CommunicationDecision> {
    const resolver = await this.resolve(actor, context);
    return resolver.decide(action, message);
  }

  /**
   * The decision, or a refusal the caller does not have to handle.
   *
   * Refusals are audited. A pattern of somebody probing conversations they cannot reach is
   * exactly what an audit log is for, and it is invisible if only successes are recorded.
   */
  async require(
    actor: AuthenticatedUser,
    action: CommunicationAction,
    context: CommunicationContext,
    message?: MessageAuthorship,
  ): Promise<CommunicationDecision> {
    const decision = await this.decide(actor, action, context, message);
    return this.enforce(actor, decision, action, context);
  }

  /**
   * Raises a decision that was already made, auditing the refusal.
   *
   * Separate from `require` so a caller holding a resolver — because it is about to ask several
   * questions about the same conversation — pays for the facts once and still gets the same
   * refusal, with the same audit row, as a caller that asked directly.
   */
  async enforce(
    actor: AuthenticatedUser,
    decision: CommunicationDecision,
    action: CommunicationAction,
    context: CommunicationContext,
  ): Promise<CommunicationDecision> {
    if (decision.allowed) {
      return decision;
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.CONVERSATION_ACCESS_DENIED,
      entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
      // The project, when there is one. A scope conversation has none, and the organization is
      // the only identifier a refused attempt at one can honestly be filed under.
      entityId: context.projectId ?? actor.organizationId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: {
        attempted: action,
        reason: decision.reason,
        projectId: context.projectId,
        taskId: context.taskId ?? null,
        ticketId: context.ticketId ?? null,
      },
    });
    if (decision.reason === COMMUNICATION_REFUSAL.NOT_ON_TASK) {
      // 404, not 403, and it is the only refusal in this file that answers that way. A task
      // conversation exists because somebody opened one on a particular piece of work, so "you may
      // not read this thread" tells a colleague on the project that this task has a discussion and
      // roughly when it started. The module already answers 404 for a conversation outside the
      // caller's tenant for exactly that reason — a conversation must not be provable by asking —
      // and somebody with no place on the task is in the same position. The audit row above is
      // written either way, so the refusal is still visible to whoever looks for a pattern of them.
      throw new NotFoundException('Conversation not found');
    }
    throw new ForbiddenException(
      decision.reason ? COMMUNICATION_REFUSAL_LABELS[decision.reason] : 'You may not do that here',
    );
  }

  private resolverFor(
    actor: AuthenticatedUser,
    flags: CommunicationFlags,
    resolved: ResolvedFacts,
  ): CommunicationResolver {
    const { internal } = resolved;
    const actorProjectRole = resolved.actorProjectRole ?? null;
    const facts = {
      isInternal: internal,
      // Internal conversations belong to the provider organization, and an internal user's tenant
      // *is* that organization. A client reaching here is already refused by `isInternal`.
      sameTenant: internal,
      actorProjectRole,
      counterpartProjectRole: resolved.counterpartProjectRole,
      sharedWorkRelationship: resolved.sharedWorkRelationship ?? false,
      ...(resolved.scope ? { scope: resolved.scope } : {}),
      ...(resolved.taskRelationship === undefined
        ? {}
        : { taskRelationship: resolved.taskRelationship }),
      chatEnabled: flags.chatEnabled,
      callingEnabled: flags.callingEnabled,
      canParticipate: actor.permissions.includes(PERMISSIONS.CONVERSATION_PARTICIPATE),
      canCall: actor.permissions.includes(PERMISSIONS.CONVERSATION_CALL),
      canInspect: actor.permissions.includes(PERMISSIONS.CONVERSATION_INSPECT),
      canPlayRecording: actor.permissions.includes(PERMISSIONS.CONVERSATION_RECORDING_PLAY),
      personalChat:
        canUsePersonalChat(actor.roleKey) ||
        actor.permissions.includes(PERMISSIONS.CONVERSATION_REACH_ORGANIZATION),
    };
    return {
      actorProjectRole,
      decide: (action, message) => canCommunicate({ ...facts, action, message }),
    };
  }
}

/**
 * The facts of one conversation, ready to answer any number of questions about it.
 *
 * The judgement itself is still `canCommunicate` in `packages/types`; this only carries the facts
 * so they are gathered once. Nothing here decides anything.
 */
export interface CommunicationResolver {
  /** The actor's role on the conversation's project, as it was at the moment of resolution. */
  actorProjectRole: ProjectMemberRole | null;
  decide(action: CommunicationAction, message?: MessageAuthorship): CommunicationDecision;
}

/**
 * A client is refused, not answered with an empty list.
 *
 * The tenant scope would return nothing to them anyway — every conversation belongs to the
 * provider organization — but an empty `200` says "there is nothing here for you", and the
 * truthful answer is "this is not yours to ask". A refusal is also the thing a test can assert,
 * and an emptiness is not.
 */
export function assertInternalActor(actor: AuthenticatedUser): void {
  if (!isInternalUser(actor)) {
    throw new ForbiddenException('Internal conversations are not part of the client portal');
  }
}
