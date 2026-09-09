import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PERMISSIONS,
  ROUTING_OUTCOME,
  ROUTING_POLICY_VERSION,
  TICKET_STATUS,
  canTransitionTicket,
  isTicketClosed,
  planRouting,
  type AuthenticatedUser,
  type TicketStatus,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { TicketsRepository, type TicketSummaryRow } from '../tickets/tickets.repository';
import { RoutingCandidatesService } from './routing-candidates.service';
import { RoutingNotificationsService } from './routing-notifications.service';
import { TicketRoutingRepository } from './ticket-routing.repository';
import { TicketRoutingService } from './ticket-routing.service';

/** How far an escalation can climb before it stops trying and simply shouts. */
const MAX_ESCALATION_LEVEL = 3;

/**
 * What happens when a timer runs out, and what happens when a person overrules the router.
 *
 * The two live together because they are the same question from opposite ends: who gets this
 * ticket when the current answer is not working. The timer's answer is "the next person in the
 * chain, then the senior, then everybody who manages routing"; a manager's answer is whoever they
 * say, and theirs wins.
 */
@Injectable()
export class RoutingEscalationService {
  constructor(
    private readonly router: TicketRoutingService,
    private readonly candidates: RoutingCandidatesService,
    private readonly routing: TicketRoutingRepository,
    private readonly tickets: TicketsRepository,
    private readonly notifications: RoutingNotificationsService,
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The acknowledgement window ran out.
   *
   * The ticket is re-routed rather than escalated straight away, because the ordinary case is not
   * a crisis — it is one developer who stepped away, and the next person in the chain is the right
   * answer. `previouslyAssigned` keeps the router from handing it back to the same person, which
   * is what would otherwise turn this into a loop.
   */
  async onAcknowledgementOverdue(
    organizationId: string,
    ticketId: string,
    now = new Date(),
  ): Promise<'rerouted' | 'escalated' | 'skipped'> {
    const ticket = await this.tickets.findSummary(organizationId, ticketId);
    if (!ticket || isTicketClosed(ticket.status as TicketStatus)) {
      await this.clearTimers(organizationId, ticketId);
      return 'skipped';
    }
    const state = await this.routing.findState(organizationId, ticketId);
    if (!state || state.acknowledgedAt || state.manualOverrideAt) {
      return 'skipped';
    }

    await this.notifications.acknowledgementOverdue(ticket, state.attempt, ticket.assignedToId);

    const result = await this.router.route(organizationId, ticketId, { mode: 'reroute', now });
    if (result.outcome === ROUTING_OUTCOME.AUTO_ASSIGNED && result.assignedUserId) {
      await this.auditLog.record({
        action: AUDIT_ACTION.TICKET_REASSIGNED,
        entityType: AUDIT_ENTITY_TYPE.TICKET,
        entityId: ticketId,
        organizationId,
        after: {
          reason: 'Not acknowledged in time',
          from: ticket.assignedToId,
          to: result.assignedUserId,
        },
      });
      return 'rerouted';
    }
    // Nobody left in the chain: this is now somebody's decision to make, not the router's.
    await this.escalate(
      organizationId,
      ticketId,
      'Nobody acknowledged and the chain is exhausted',
      now,
    );
    return 'escalated';
  }

  /**
   * Move the ticket up: backup, then senior, then support executive; and whatever happens, tell
   * everyone who manages routing.
   *
   * The original assignee is never cleared by an escalation. Who was asked first is part of the
   * story, and a screen that showed only the escalation target would lose it.
   */
  async escalate(
    organizationId: string,
    ticketId: string,
    reason: string,
    now = new Date(),
  ): Promise<TicketSummaryRow | null> {
    const ticket = await this.tickets.findSummary(organizationId, ticketId);
    if (!ticket || isTicketClosed(ticket.status as TicketStatus)) {
      await this.clearTimers(organizationId, ticketId);
      return null;
    }
    const state = await this.routing.findState(organizationId, ticketId);
    const level = (state?.escalationLevel ?? 0) + 1;
    const attempt = await this.routing.claimAttempt(organizationId, ticketId, state?.attempt ?? 0);
    if (attempt === null) {
      return null;
    }

    let target: string | null = null;
    if (ticket.projectId && level <= MAX_ESCALATION_LEVEL) {
      const bundle = await this.candidates.escalationCandidates(
        organizationId,
        ticket.projectId,
        now,
      );
      const previouslyAssigned = await this.routing.previouslyAssigned(organizationId, ticketId);
      const plan = planRouting(bundle.candidates, {
        workArea: null,
        requesterId: ticket.requesterId,
        previouslyAssigned,
        autoRouteEnabled: true,
        // An escalation is not subject to the direct-type rule: it has already been decided that
        // this ticket needs a person, and the only question left is which one.
        isDirectType: true,
      });
      target = plan.assignedUserId;
      await this.routing.recordTrail(
        organizationId,
        ticketId,
        plan.trail.map((entry) => ({
          attempt,
          position: entry.position,
          candidateUserId: entry.userId,
          role: entry.role,
          accepted: entry.accepted,
          skipReason: entry.skipReason,
          detail: `Escalation level ${level} — ${entry.detail}`,
          policyVersion: plan.policyVersion,
        })),
      );
    }

    /**
     * The status move, when the table allows one; otherwise the escalation without it.
     *
     * This used to write ESCALATED over whatever the ticket was, which is how
     * `WAITING_CLIENT → ESCALATED` and `REVIEW → ESCALATED` — neither in `TICKET_TRANSITIONS` —
     * were reachable. Adding those edges was the wrong repair: a ticket parked on the client would
     * stop reading as parked on the client, to the desk and to the client, and a ticket in review
     * would lose the fact that somebody has it. The status says what the ticket is waiting for and
     * an escalation does not change the answer.
     *
     * So the escalation happens either way — the reassignment, the routing state, the audit row
     * and the notifications are unconditional — and only the status move is conditional on the
     * table allowing it. Where it does not, the escalation is on the activity trail instead, which
     * is where a support person reads the ticket's story anyway.
     */
    const from = ticket.status as TicketStatus;
    const assignment = target ? { assignedToId: target } : {};
    const note = `Escalated: ${reason}`;
    const changedById = target ?? ticket.requesterId;
    const row = canTransitionTicket(from, TICKET_STATUS.ESCALATED)
      ? await this.tickets.transition(
          organizationId,
          ticketId,
          from,
          TICKET_STATUS.ESCALATED,
          changedById,
          note,
          assignment,
        )
      : await this.escalateInPlace(organizationId, ticketId, from, changedById, note, assignment);
    await this.routing.saveState(organizationId, ticketId, attempt, {
      outcome: target ? ROUTING_OUTCOME.AUTO_ASSIGNED : ROUTING_OUTCOME.SUPPORT_QUEUE,
      escalationLevel: level,
      policyVersion: ROUTING_POLICY_VERSION,
      // Deliberately cleared. An escalated ticket is being looked at by a person now, and a timer
      // that kept firing would bury them in notifications about work already in hand.
      acknowledgeDueAt: null,
      escalationDueAt: null,
      queueReason: target ? null : reason,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.TICKET_ESCALATED,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: ticketId,
      organizationId,
      after: { level, reason, to: target, previousAssignee: ticket.assignedToId },
    });
    await this.notifications.escalated(row, level, target);
    return row;
  }

  /**
   * A manager assigning by hand.
   *
   * `manualOverrideAt` is the important part: it is a stop sign the router reads before doing
   * anything, so a person's decision is not quietly undone two minutes later by a sweep. Only an
   * explicit re-route clears it, and only somebody who could have assigned in the first place can
   * ask for that.
   */
  async reassign(
    actor: AuthenticatedUser,
    ticketId: string,
    toUserId: string,
    reason: string,
  ): Promise<void> {
    if (!actor.permissions.includes(PERMISSIONS.TICKET_REASSIGN)) {
      throw new ForbiddenException('Your role cannot reassign tickets');
    }
    const ticket = await this.tickets.findSummary(actor.organizationId, ticketId);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    if (isTicketClosed(ticket.status as TicketStatus)) {
      throw new BadRequestException('A closed ticket cannot be reassigned');
    }
    const member = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: actor.organizationId, userId: toUserId, deletedAt: null },
    });
    if (!member) {
      throw new BadRequestException('The assignee must be internal staff');
    }

    const state = await this.routing.findState(actor.organizationId, ticketId);
    const attempt = await this.routing.claimAttempt(
      actor.organizationId,
      ticketId,
      state?.attempt ?? 0,
    );
    if (attempt === null) {
      throw new BadRequestException('This ticket is being routed right now — try again');
    }

    const target: TicketStatus =
      ticket.status === TICKET_STATUS.NEW ||
      ticket.status === TICKET_STATUS.REOPENED ||
      ticket.status === TICKET_STATUS.AUTO_ASSIGNED ||
      ticket.status === TICKET_STATUS.ESCALATED ||
      ticket.status === TICKET_STATUS.ACKNOWLEDGED
        ? TICKET_STATUS.ASSIGNED
        : (ticket.status as TicketStatus);

    const row =
      target === ticket.status
        ? await this.tickets.addActivity(
            actor.organizationId,
            ticketId,
            ticket.status,
            actor.userId,
            `Reassigned: ${reason}`,
          )
        : await this.tickets.transition(
            actor.organizationId,
            ticketId,
            ticket.status,
            target,
            actor.userId,
            `Reassigned: ${reason}`,
            { assignedToId: toUserId },
          );
    if (target === ticket.status) {
      await this.tickets.update(actor.organizationId, ticketId, { assignedToId: toUserId });
    }

    await this.routing.saveState(actor.organizationId, ticketId, attempt, {
      outcome: ROUTING_OUTCOME.MANUAL,
      assignmentType: 'MANUAL',
      manualOverrideById: actor.userId,
      manualOverrideAt: new Date(),
      manualOverrideReason: reason,
      // A person owns it now; the router's timers stop.
      acknowledgeDueAt: null,
      acknowledgedAt: null,
      acknowledgedById: null,
      escalationDueAt: null,
      queueReason: null,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.TICKET_REASSIGNED,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: ticketId,
      organizationId: actor.organizationId,
      after: { from: ticket.assignedToId, to: toUserId, reason, by: actor.userId },
    });
    await this.notifications.reassigned(row, toUserId, actor.userId, reason);
  }

  /** The escalation for a ticket whose current status has no ESCALATED edge: note, not status. */
  private async escalateInPlace(
    organizationId: string,
    ticketId: string,
    status: TicketStatus,
    changedById: string,
    note: string,
    assignment: { assignedToId?: string },
  ): Promise<TicketSummaryRow> {
    const row = await this.tickets.addActivity(organizationId, ticketId, status, changedById, note);
    if (assignment.assignedToId) {
      return this.tickets.update(organizationId, ticketId, assignment);
    }
    return row;
  }

  private clearTimers(organizationId: string, ticketId: string) {
    return this.prisma.ticketRoutingState.updateMany({
      where: { ticketId, organizationId },
      data: { acknowledgeDueAt: null, escalationDueAt: null },
    });
  }
}
