import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  ROUTING_OUTCOME,
  ROUTING_POLICY_VERSION,
  SUPPORT_TIER,
  TICKET_STATUS,
  isTicketClosed,
  neutralTierPolicy,
  planRouting,
  tierTiming,
  type AuthenticatedUser,
  type RoutingPlan,
  type SupportTier,
  type SupportTierPolicy,
  type TicketStatus,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { SupportTierPolicyService } from '../support-tiers/support-tier-policy.service';
import { TicketsRepository, type TicketSummaryRow } from '../tickets/tickets.repository';
import { RoutingCandidatesService, type RoutingConfig } from './routing-candidates.service';
import { RoutingNotificationsService } from './routing-notifications.service';
import {
  ACKNOWLEDGEABLE,
  FORCE_ROUTABLE,
  ROUTABLE,
  isDirectType,
  toTrailRows,
} from './routing-rules';
import { TicketRoutingRepository, type TrailInput } from './ticket-routing.repository';

/**
 * Why the router was called.
 *
 * `initial` is the trigger that follows raising a ticket, and it places a ticket that has not
 * been placed. `reroute` is a deliberate second pass — the acknowledgement timer, or a manager
 * asking — and is the only thing that may move a ticket the router has already put somewhere.
 */
export type RouteMode = 'initial' | 'reroute';

export interface RouteResult {
  outcome: RoutingPlan['outcome'];
  assignedUserId: string | null;
  attempt: number;
  /** False when another worker was already routing this ticket and this call stood down. */
  applied: boolean;
}

/**
 * The router.
 *
 * It decides *nothing* itself: the ordering and the eligibility rules live in `planRouting` in
 * `packages/types`, which is pure and unit-tested against every branch. What this service does is
 * gather the facts, claim the right to act, apply the outcome atomically, and write down what
 * happened. Keeping the judgement out of here is what makes the judgement testable.
 */
@Injectable()
export class TicketRoutingService {
  constructor(
    private readonly candidates: RoutingCandidatesService,
    private readonly routing: TicketRoutingRepository,
    private readonly tickets: TicketsRepository,
    private readonly notifications: RoutingNotificationsService,
    private readonly auditLog: AuditLogService,
    private readonly tiers: SupportTierPolicyService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TicketRoutingService.name);
  }

  /**
   * Routes one ticket, or explains why it is staying where it is.
   *
   * Never throws for an unroutable ticket. A support ticket that cannot be routed is a ticket that
   * needs a person, not an exception in a queue worker — so every dead end here ends in the
   * support queue with a reason on it and somebody notified.
   */
  async route(
    organizationId: string,
    ticketId: string,
    options: { actorId?: string; force?: boolean; mode?: RouteMode; now?: Date } = {},
  ): Promise<RouteResult> {
    const now = options.now ?? new Date();
    const deliberate = options.mode === 'reroute' || options.force === true;
    const ticket = await this.tickets.findSummary(organizationId, ticketId);
    if (!ticket) {
      throw new BadRequestException('Ticket not found');
    }
    const state = await this.routing.findState(organizationId, ticketId);

    /**
     * Somebody has already been here, so an unasked-for pass stands down.
     *
     * The test is the mere existence of the state row, not whether the earlier pass finished. A
     * narrower test — "already has an assignee" — leaves a window between the row being created
     * and the outcome being written, and a second caller reading inside that window claims the
     * next attempt and routes the ticket again, landing it on somebody else. One raise, one
     * placement.
     *
     * This is what makes the *initial* trigger idempotent, which it has to be: the queue can
     * deliver the same job twice, and it retries on failure. Re-routing stays something a caller
     * asks for — the acknowledgement timer, or a manager — rather than something that falls out
     * of two triggers overlapping.
     */
    if (!deliberate && state !== null) {
      return {
        outcome: state.outcome as RoutingPlan['outcome'],
        assignedUserId: ticket.assignedToId,
        attempt: state.attempt,
        applied: false,
      };
    }

    const allowed = options.force ? FORCE_ROUTABLE : ROUTABLE;
    if (
      isTicketClosed(ticket.status as TicketStatus) ||
      !allowed.includes(ticket.status as TicketStatus)
    ) {
      return {
        outcome: ROUTING_OUTCOME.MANUAL,
        assignedUserId: ticket.assignedToId,
        attempt: state?.attempt ?? 0,
        applied: false,
      };
    }
    // A person's decision outranks the router's. Only an explicit re-route clears it.
    if (state?.manualOverrideAt && !options.force) {
      return {
        outcome: ROUTING_OUTCOME.MANUAL,
        assignedUserId: ticket.assignedToId,
        attempt: state.attempt,
        applied: false,
      };
    }

    const attempt = await this.routing.claimAttempt(organizationId, ticketId, state?.attempt ?? 0);
    if (attempt === null) {
      // Somebody else is routing this ticket right now. Two assignees is worse than none.
      this.logger.debug({ ticketId }, 'Stood down: another routing attempt is in flight');
      return {
        outcome: ROUTING_OUTCOME.MANUAL,
        assignedUserId: ticket.assignedToId,
        attempt: state?.attempt ?? 0,
        applied: false,
      };
    }

    if (!ticket.projectId) {
      // Nothing to route against: support ownership is per project.
      await this.queue(
        organizationId,
        ticket,
        attempt,
        'The ticket is not linked to a project',
        [],
      );
      return {
        outcome: ROUTING_OUTCOME.SUPPORT_QUEUE,
        assignedUserId: null,
        attempt,
        applied: true,
      };
    }

    const bundle = await this.candidates.build(
      organizationId,
      ticket.projectId,
      ticket.module,
      now,
    );
    const previouslyAssigned = await this.routing.previouslyAssigned(organizationId, ticketId);
    const plan = planRouting(bundle.candidates, {
      workArea: ticket.module,
      requesterId: ticket.requesterId,
      previouslyAssigned,
      autoRouteEnabled: bundle.config.autoRouteEnabled,
      isDirectType: isDirectType(bundle.config, ticket.type),
    });

    const trail = toTrailRows(plan, attempt);
    if (plan.outcome === ROUTING_OUTCOME.AUTO_ASSIGNED && plan.assignedUserId) {
      await this.assign(
        organizationId,
        ticket,
        attempt,
        plan.assignedUserId,
        bundle.config,
        trail,
        now,
      );
      return { outcome: plan.outcome, assignedUserId: plan.assignedUserId, attempt, applied: true };
    }

    await this.queue(
      organizationId,
      ticket,
      attempt,
      plan.queueReason ?? 'No eligible developer',
      trail,
      plan.outcome === ROUTING_OUTCOME.DISABLED
        ? ROUTING_OUTCOME.DISABLED
        : ROUTING_OUTCOME.SUPPORT_QUEUE,
      bundle.config.fallbackUserId,
    );
    return { outcome: plan.outcome, assignedUserId: null, attempt, applied: true };
  }

  private async assign(
    organizationId: string,
    ticket: TicketSummaryRow,
    attempt: number,
    userId: string,
    config: RoutingConfig,
    trail: TrailInput[],
    now: Date,
  ): Promise<void> {
    /**
     * The tier's timings, where it sets any.
     *
     * This changes *when* a ticket escalates and never *who* it reaches: the chain, the
     * eligibility rules and the trail `planRouting` produced are all untouched by it. That is
     * exactly why `ROUTING_POLICY_VERSION` does not move — a trail read a year from now is still
     * interpretable against version 1, because version 1 is still what decided it.
     *
     * A product with no tier policy resolves to the neutral one, whose minutes are null, and the
     * project's own values stand as they always have.
     */
    const timing = tierTiming(
      await this.tierOf(ticket),
      config.ackMinutes,
      config.escalationMinutes,
    );
    const acknowledgeDueAt = new Date(now.getTime() + timing.ackMinutes * 60_000);
    // The escalation deadline is measured from the acknowledgement one, not from now: the two
    // windows are consecutive, which is what "acknowledge in 15, escalate 30 after that" means.
    const escalationDueAt = new Date(
      acknowledgeDueAt.getTime() + timing.escalationMinutes * 60_000,
    );

    const row = await this.tickets.transition(
      organizationId,
      ticket.id,
      ticket.status,
      TICKET_STATUS.AUTO_ASSIGNED,
      userId,
      `Routed automatically (attempt ${attempt})`,
      { assignedToId: userId },
    );
    await this.routing.saveState(organizationId, ticket.id, attempt, {
      outcome: ROUTING_OUTCOME.AUTO_ASSIGNED,
      assignmentType: 'AUTOMATIC',
      policyVersion: ROUTING_POLICY_VERSION,
      routedAt: now,
      acknowledgeDueAt,
      acknowledgedAt: null,
      acknowledgedById: null,
      escalationDueAt,
      queueReason: null,
      // The router assigned this, so by definition no manual override is standing any more. Who
      // set the override, and why, stays in the audit log — this field only answers "is one in
      // force right now", and the answer is no.
      manualOverrideById: null,
      manualOverrideAt: null,
      manualOverrideReason: null,
    });
    await this.routing.recordTrail(organizationId, ticket.id, trail);
    await this.auditLog.record({
      action: AUDIT_ACTION.TICKET_ROUTED,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: ticket.id,
      organizationId,
      after: {
        attempt,
        assignedToId: userId,
        acknowledgeDueAt,
        policyVersion: ROUTING_POLICY_VERSION,
      },
    });
    await this.notifications.autoAssigned(row, userId);
  }

  private async queue(
    organizationId: string,
    ticket: TicketSummaryRow,
    attempt: number,
    reason: string,
    trail: TrailInput[],
    outcome: 'SUPPORT_QUEUE' | 'DISABLED' = ROUTING_OUTCOME.SUPPORT_QUEUE,
    fallbackUserId: string | null = null,
  ): Promise<void> {
    // The ticket stays exactly where it is and keeps whatever assignee it had. Nothing is
    // cleared: a ticket that cannot be routed must not become less visible than it already was.
    await this.routing.saveState(organizationId, ticket.id, attempt, {
      outcome,
      policyVersion: ROUTING_POLICY_VERSION,
      routedAt: new Date(),
      acknowledgeDueAt: null,
      escalationDueAt: null,
      queueReason: reason,
    });
    if (trail.length > 0) {
      await this.routing.recordTrail(organizationId, ticket.id, trail);
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.TICKET_ROUTING_QUEUED,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: ticket.id,
      organizationId,
      after: { attempt, outcome, reason },
    });
    if (outcome === ROUTING_OUTCOME.SUPPORT_QUEUE) {
      await this.notifications.unroutable(ticket, reason, fallbackUserId);
    }
  }

  /**
   * The support tier behind a ticket, or the neutral one.
   *
   * A ticket that came through no product has no tier, and neither does one whose product has
   * been removed. Both resolve to the neutral policy rather than to a default anybody has to
   * remember, so a ticket raised in the portal keeps exactly the timings it had before tiers
   * existed.
   */
  private tierOf(ticket: TicketSummaryRow): Promise<SupportTierPolicy> {
    const tier = ticket.product?.supportTier as SupportTier | undefined;
    if (!tier) {
      return Promise.resolve(neutralTierPolicy(SUPPORT_TIER.STANDARD));
    }
    return this.tiers.forTier(ticket.organizationId, tier);
  }

  /** The assignee saying "I have this". Idempotent, and safe against the escalation sweep. */
  async acknowledge(
    actor: AuthenticatedUser,
    ticketId: string,
    now = new Date(),
  ): Promise<boolean> {
    const ticket = await this.tickets.findSummary(actor.organizationId, ticketId);
    if (!ticket) {
      throw new BadRequestException('Ticket not found');
    }
    if (ticket.assignedToId !== actor.userId) {
      throw new ForbiddenException('Only the person a ticket is assigned to can acknowledge it');
    }
    const claimed = await this.routing.acknowledge(
      actor.organizationId,
      ticketId,
      actor.userId,
      now,
    );
    if (!claimed) {
      return false;
    }
    // ESCALATED belongs here as much as the other two: the transition table has always allowed it,
    // and an escalation is precisely the moment somebody says "I have this". Leaving it out meant
    // the assignee's acknowledgement was recorded on the routing state and the ticket stayed
    // escalated, which reads to everyone else as still nobody's problem.
    if (ACKNOWLEDGEABLE.includes(ticket.status as TicketStatus)) {
      await this.tickets.transition(
        actor.organizationId,
        ticketId,
        ticket.status,
        TICKET_STATUS.ACKNOWLEDGED,
        actor.userId,
        'Acknowledged',
      );
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.TICKET_ACKNOWLEDGED,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: ticketId,
      organizationId: actor.organizationId,
      after: { acknowledgedBy: actor.userId },
    });
    return true;
  }
}
