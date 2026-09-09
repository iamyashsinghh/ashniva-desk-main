import { Injectable } from '@nestjs/common';
import {
  planCallTarget,
  planRouting,
  type CallAssigneeInput,
  type CallTargetDecision,
  type RoutingPlan,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { RoutingCandidatesService } from '../ticket-routing/routing-candidates.service';
import type { EffectiveIvrPolicy } from '../ivr/ivr-policy.service';
import type { TicketSummaryRow } from '../tickets/tickets.repository';

/**
 * Where a support call should go.
 *
 * There is no routing logic in this file, and that is the point. Package 8b decides who is
 * eligible — it reads support ownership, the rota, working hours, leave, workload and manual
 * overrides — and this service calls *its* functions to get *its* answers: `build` and
 * `escalationCandidates` for the candidates, `planRouting` for the decision, `availabilityOf` for
 * whether the ticket's own owner is there. The only rule added on top is the one a call has and a
 * ticket does not — ring the person already on the ticket first — and even that lives in
 * `planCallTarget` in packages/types, where it is unit-tested.
 *
 * Fallback works by asking 8b again with the destinations already rung excluded, the same
 * mechanism a re-routed ticket uses. So "the next eligible person" means exactly what it means
 * everywhere else in Desk, computed by the code that owns the definition.
 */
@Injectable()
export class CallRoutingService {
  constructor(
    private readonly candidates: RoutingCandidatesService,
    private readonly prisma: PrismaService,
  ) {}

  async plan(
    organizationId: string,
    ticket: TicketSummaryRow,
    policy: EffectiveIvrPolicy,
    context: { alreadyTried: readonly string[]; attemptsUsed: number },
    now = new Date(),
  ): Promise<CallTargetDecision> {
    const projectId = ticket.projectId;
    const tried = context.alreadyTried;

    if (!projectId) {
      // Nothing to route against: support ownership, rotas and escalation are all per project.
      return planCallTarget({
        assignee: null,
        plan: null,
        escalation: null,
        fallbackUserId: policy.fallbackUserId,
        fallbackEligible: await this.isEligible(organizationId, policy.fallbackUserId),
        alreadyTried: tried,
        attemptsUsed: context.attemptsUsed,
        maxAttempts: policy.maxAttempts,
      });
    }

    const [assignee, chain, escalation] = await Promise.all([
      this.assigneeOf(organizationId, projectId, ticket.assignedToId, now),
      this.chainPlan(organizationId, projectId, ticket, tried, now),
      this.escalationPlan(organizationId, projectId, ticket, tried, now),
    ]);

    // The product's own destination first, then the project's routing fallback. A product that
    // names nobody inherits whatever its project already decided rather than falling through to
    // the support queue for want of a second setting.
    const fallbackUserId = policy.fallbackUserId ?? chain.fallbackUserId;

    return planCallTarget({
      assignee,
      plan: chain.plan,
      escalation,
      fallbackUserId,
      fallbackEligible: await this.isEligible(organizationId, fallbackUserId),
      alreadyTried: tried,
      attemptsUsed: context.attemptsUsed,
      maxAttempts: policy.maxAttempts,
    });
  }

  /** The ticket's current owner, resolved through package 8a's availability resolver. */
  private async assigneeOf(
    organizationId: string,
    projectId: string,
    assignedToId: string | null,
    now: Date,
  ): Promise<CallAssigneeInput | null> {
    if (!assignedToId) {
      return null;
    }
    const facts = await this.candidates.availabilityOf(
      organizationId,
      projectId,
      assignedToId,
      now,
    );
    return {
      userId: assignedToId,
      available: facts.available,
      unavailableReason: facts.unavailableReason,
      // Somebody who has left the project cannot take a call about it, even while the ticket
      // still names them: the assignment is stale, not authoritative.
      isActive: facts.isActive && facts.isProjectMember,
    };
  }

  private async chainPlan(
    organizationId: string,
    projectId: string,
    ticket: TicketSummaryRow,
    alreadyTried: readonly string[],
    now: Date,
  ): Promise<{ plan: RoutingPlan; fallbackUserId: string | null }> {
    const bundle = await this.candidates.build(organizationId, projectId, ticket.module, now);
    const plan = planRouting(bundle.candidates, {
      workArea: ticket.module,
      requesterId: ticket.requesterId,
      // This call's own destinations, not the ticket's routing history: a developer the router
      // tried yesterday may well be the right person to answer the telephone today.
      previouslyAssigned: alreadyTried,
      autoRouteEnabled: bundle.config.autoRouteEnabled,
      // A call is always direct. `directTypes` decides whether a *ticket* skips the support
      // queue; somebody who has already picked up the phone is past that question.
      isDirectType: true,
    });
    return { plan, fallbackUserId: bundle.config.fallbackUserId };
  }

  private async escalationPlan(
    organizationId: string,
    projectId: string,
    ticket: TicketSummaryRow,
    alreadyTried: readonly string[],
    now: Date,
  ): Promise<RoutingPlan> {
    const bundle = await this.candidates.escalationCandidates(organizationId, projectId, now);
    return planRouting(bundle.candidates, {
      workArea: null,
      requesterId: ticket.requesterId,
      previouslyAssigned: alreadyTried,
      autoRouteEnabled: true,
      isDirectType: true,
    });
  }

  /**
   * Whether a configured fallback could take a call at all.
   *
   * Only membership, deliberately: a fallback is where a call goes when everybody who *should*
   * have answered did not, so refusing it for being outside working hours would turn the last
   * resort into no resort. Whether they pick up is the telephone's business.
   */
  private async isEligible(organizationId: string, userId: string | null): Promise<boolean> {
    if (!userId) {
      return false;
    }
    const count = await this.prisma.organizationMembership.count({
      where: {
        organizationId,
        userId,
        deletedAt: null,
        user: { deletedAt: null, status: 'ACTIVE' },
      },
    });
    return count > 0;
  }
}
