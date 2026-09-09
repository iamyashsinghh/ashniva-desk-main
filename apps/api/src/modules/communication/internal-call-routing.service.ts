import { Injectable } from '@nestjs/common';
import {
  INTERNAL_CALL_FALLBACK,
  PROJECT_MEMBER_ROLE,
  type InternalCallFallback,
  type ProjectMemberRole,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { RoutingCandidatesService } from '../ticket-routing/routing-candidates.service';

/** One destination for an internal call, and why it was chosen. */
export interface InternalCallTarget {
  userId: string | null;
  reason: string;
}

/**
 * Where an internal call goes — which is emphatically **not** where a support call goes.
 *
 * Package 9's ladder walks the support chain: module owner, primary developer, on-call, backup,
 * escalation, support queue. That is right for a client's problem, because the problem belongs to
 * whoever can take it. It is *wrong* for a developer ringing a tester about their own work: that
 * is a private conversation, and quietly connecting it to an unrelated support agent would be a
 * disclosure dressed up as a fallback.
 *
 * So this service shares package 9's *primitives* — the provider adapter, the call log, the
 * lifecycle, the recording model, the availability resolver — and none of its destination policy.
 * The rule here is short enough to state in one sentence: **ring the person the call is for.**
 *
 * The only widening available is the organization's own `internalCallFallback`, and the only
 * value it can take beyond `NONE` is the project's lead or manager — somebody the role pairing
 * already admits to a direct conversation with the caller. There is no configuration that reaches
 * further, and there is no path from here into the support chain.
 */
@Injectable()
export class InternalCallRoutingService {
  constructor(
    private readonly candidates: RoutingCandidatesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The next destination for this call, or none.
   *
   * `alreadyTried` is what makes a second pass move on rather than ring the same person twice.
   * Availability is consulted through package 8a's resolver — the same one the router uses — so
   * "on leave" means the same thing to a chat call as it does to a ticket.
   */
  async next(
    organizationId: string,
    projectId: string,
    intendedUserId: string,
    fallback: InternalCallFallback,
    alreadyTried: readonly string[],
    now = new Date(),
  ): Promise<InternalCallTarget> {
    if (!alreadyTried.includes(intendedUserId)) {
      const facts = await this.candidates.availabilityOf(
        organizationId,
        projectId,
        intendedUserId,
        now,
      );
      if (facts.isActive && facts.isProjectMember) {
        // Availability is *reported*, not enforced. Somebody outside their working hours may
        // still be the only right person to ring about their own work, and refusing to try would
        // be Desk deciding something the caller is better placed to decide.
        return {
          userId: intendedUserId,
          reason: facts.available
            ? 'The person this call is for'
            : 'The person this call is for, who is outside their working hours',
        };
      }
      return {
        userId: null,
        reason: 'The person this call is for is no longer on this project',
      };
    }

    if (fallback === INTERNAL_CALL_FALLBACK.NONE) {
      // The documented default, and the reason this service exists as a separate thing: a private
      // call that is not answered is simply not answered.
      return {
        userId: null,
        reason: 'They did not answer, and this organization does not redirect internal calls',
      };
    }

    const lead = await this.projectLead(projectId, alreadyTried);
    if (!lead) {
      return { userId: null, reason: 'They did not answer, and the project has no lead to try' };
    }
    return { userId: lead, reason: 'They did not answer; the project lead was tried next' };
  }

  /**
   * The project's lead, or failing that its manager.
   *
   * The only person an internal call may be redirected to, and only when the organization has
   * asked for it. Both roles pair with every other role on the project already, so redirecting to
   * one discloses nothing the caller could not have said to them directly.
   */
  private async projectLead(projectId: string, exclude: readonly string[]): Promise<string | null> {
    const rows = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        role: { in: [PROJECT_MEMBER_ROLE.LEAD, PROJECT_MEMBER_ROLE.MANAGER] },
        userId: { notIn: [...exclude] },
        user: { deletedAt: null, status: 'ACTIVE' },
      },
      select: { userId: true, role: true },
    });
    const byRole = (role: ProjectMemberRole) => rows.find((row) => row.role === role)?.userId;
    return byRole(PROJECT_MEMBER_ROLE.LEAD) ?? byRole(PROJECT_MEMBER_ROLE.MANAGER) ?? null;
  }
}
