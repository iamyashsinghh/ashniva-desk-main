import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CALL_STATUS,
  PERMISSIONS,
  isCallTerminal,
  isTicketClosed,
  shouldRecord,
  type AuthenticatedUser,
  type CallAvailability,
  type CallStatus,
  type CallSummary,
  type PortalCallSummary,
  type TicketStatus,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { IvrPolicyService, type EffectiveIvrPolicy } from '../ivr/ivr-policy.service';
import { maskPhone } from '../messaging/destination-mask';
import { SupportTierPolicyService } from '../support-tiers/support-tier-policy.service';
import { TicketsService } from '../tickets/tickets.service';
import type { TicketSummaryRow } from '../tickets/tickets.repository';
import { CallLogsRepository, type CallRow } from './call-logs.repository';
import { CallPlacementService } from './call-placement.service';
import { CallRecordingService } from './call-recording.service';
import { toCallSummary, toPortalCall } from './calls.mapper';

/** Why a Call Support action is not on offer. Returned so a disabled control can say so. */
type Refusal = string | null;

/**
 * Support calls, from the outside.
 *
 * Two callers reach these methods and they are governed differently, which is why the controller
 * carries no blanket permission decorator:
 *
 *  * **internal staff** need `call:initiate`, the permission that exists for exactly this;
 *  * **the person who raised the ticket** needs no permission at all — a client never holds one —
 *    but may only do it on their own ticket, and only where the product's policy says a requester
 *    may ask for a call.
 *
 * Neither is ever told a telephone number. The IVR bridges both legs, so the client does not
 * learn the developer's number and the developer does not learn the client's.
 */
@Injectable()
export class CallsService {
  constructor(
    private readonly calls: CallLogsRepository,
    private readonly tickets: TicketsService,
    private readonly policies: IvrPolicyService,
    private readonly placement: CallPlacementService,
    private readonly recordings: CallRecordingService,
    private readonly auditLog: AuditLogService,
    private readonly tiers: SupportTierPolicyService,
  ) {}

  /** Whether this person may start a call about this ticket right now, and why not if not. */
  async availability(actor: AuthenticatedUser, ticketId: string): Promise<CallAvailability> {
    const ticket = await this.tickets.requireSummary(actor, ticketId);
    const refusal = await this.refusalFor(actor, ticket);
    return { enabled: refusal === null, reason: refusal };
  }

  /**
   * Start a call about a ticket.
   *
   * Writes the record first and asks the provider second, so a call that the provider accepts and
   * then never reports still exists in Desk to be chased. The reverse order would lose exactly
   * the calls that most need finding.
   */
  async initiate(
    actor: AuthenticatedUser,
    ticketId: string,
    input: { recordingConsent?: boolean },
  ): Promise<CallSummary> {
    const ticket = await this.tickets.requireSummary(actor, ticketId);
    const refusal = await this.refusalFor(actor, ticket);
    if (refusal !== null) {
      throw new ForbiddenException(refusal);
    }
    const policy = await this.policyFor(ticket);
    if (!policy) {
      throw new BadRequestException('This ticket is not linked to a product with IVR enabled');
    }

    const phone = await this.calls.clientPhoneOf(ticket);
    const created = await this.calls.create({
      // The provider organization owns the call, as it owns the ticket. A client user's own
      // organization id is not the tenant these rows live in.
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      productId: policy.productId,
      projectId: ticket.projectId,
      providerKey: this.placement.providerKey,
      status: CALL_STATUS.REQUESTED,
      initiatedById: actor.userId,
      requesterId: ticket.requesterId,
      externalRequesterId: ticket.externalRequesterId,
      // Masked at rest as well as in transit. The history needs enough to recognise a row, not
      // enough to dial anybody, and a support ticket is not a directory.
      clientPhoneRef: phone ? maskPhone(phone) : null,
      recordingConsent: shouldRecord(policy.recordingPolicy, input.recordingConsent ?? false),
      maxAttempts: policy.maxAttempts,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.CALL_INITIATED,
      entityType: AUDIT_ENTITY_TYPE.CALL,
      entityId: created.id,
      organizationId: ticket.organizationId,
      actorUserId: actor.userId,
      after: {
        ticketId: ticket.id,
        productId: policy.productId,
        recordingConsent: created.recordingConsent,
      },
    });

    const placed = await this.placement.advance(ticket.organizationId, created.id);
    return this.present(actor, placed);
  }

  /** Somebody called it off before it connected. */
  async cancel(actor: AuthenticatedUser, callId: string): Promise<CallSummary> {
    const organizationId = await this.tickets.providerId(actor);
    const call = await this.calls.find(organizationId, callId);
    if (!call) {
      throw new NotFoundException('Call not found');
    }
    if (!call.ticket) {
      // A call with no ticket is an internal one; cancelling it is package 9b's own endpoint.
      throw new NotFoundException('Call not found');
    }
    this.assertMayInitiate(actor, call.ticket.clientOrganizationId, call.requesterId);
    if (isCallTerminal(call.status as CallStatus)) {
      throw new BadRequestException('This call has already finished');
    }
    const moved = await this.calls.transition(call.id, call.status as CallStatus, {
      status: CALL_STATUS.CANCELLED,
      endedAt: new Date(),
    });
    if (!moved) {
      throw new BadRequestException('This call has already finished');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.CALL_CANCELLED,
      entityType: AUDIT_ENTITY_TYPE.CALL,
      entityId: call.id,
      organizationId,
      actorUserId: actor.userId,
      after: { ticketId: call.ticketId },
    });
    const reread = await this.calls.find(organizationId, callId);
    return this.present(actor, reread ?? call);
  }

  /** The internal call history on a ticket. Needs `call:read-internal`. */
  async historyFor(actor: AuthenticatedUser, ticketId: string): Promise<CallSummary[]> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('The internal call history is not part of the client portal');
    }
    if (!actor.permissions.includes(PERMISSIONS.CALL_READ_INTERNAL)) {
      throw new ForbiddenException('Viewing call history needs the call:read-internal permission');
    }
    const ticket = await this.tickets.requireSummary(actor, ticketId);
    const rows = await this.calls.forTicket(ticket.organizationId, ticketId);
    // One decision pass for the whole history, rather than one per call: the product policy and
    // the caller's role on the project are the same for every row.
    const decisions = await this.recordings.decideAll(actor, rows);
    return rows.map((row) =>
      toCallSummary(row, decisions.get(row.id) ?? { allowed: false, reason: null }),
    );
  }

  /**
   * What a client sees about calls on their own ticket.
   *
   * The allow-list mapper decides what that is, and it is four fields. There is no shape here
   * that could carry a staff name, a recording or a routing reason, so no future edit can leak
   * one by forgetting to strip it.
   */
  async portalHistoryFor(actor: AuthenticatedUser, ticketId: string): Promise<PortalCallSummary[]> {
    // `requireSummary` is what pins a client to their own organization; asking it first means
    // the call history can never be read for a ticket the caller cannot read.
    const ticket = await this.tickets.requireSummary(actor, ticketId);
    const rows = await this.calls.forTicket(ticket.organizationId, ticketId);
    return rows.map(toPortalCall);
  }

  private async present(actor: AuthenticatedUser, row: CallRow): Promise<CallSummary> {
    return toCallSummary(row, await this.recordings.decide(actor, row));
  }

  /**
   * Every reason a call may not start, in the order somebody deserves to hear them.
   *
   * Returns a sentence rather than throwing, because the same answer drives both the API's
   * refusal and the screen's disabled control — and a disabled control that cannot say why is
   * only slightly better than one that lies.
   */
  private async refusalFor(actor: AuthenticatedUser, ticket: TicketSummaryRow): Promise<Refusal> {
    if (isTicketClosed(ticket.status as TicketStatus)) {
      return 'This ticket is closed';
    }
    const policy = await this.policyFor(ticket);
    if (!policy) {
      return 'This ticket is not linked to a registered product';
    }
    if (!policy.ivrEnabled) {
      return `Support calls are switched off for ${policy.productName}`;
    }
    if (!policy.supportEnabled) {
      return `Support is switched off for ${policy.productName}`;
    }
    if (policy.allowedTiers.length > 0 && !policy.allowedTiers.includes(policy.supportTier)) {
      return `Support calls are not part of the ${policy.supportTier.toLowerCase()} tier`;
    }

    const internal = isInternalUser(actor);
    // The tier's own answer, which is about the entitlement rather than about this product's IVR
    // settings. Both are consulted: a product may switch calls off for everybody even where the
    // tier permits them, and a tier may withhold them even where the product offers them.
    const tier = await this.tiers.forTier(ticket.organizationId, policy.supportTier);
    const tierRefusal = this.tiers.callRefusal(tier, !internal);
    if (tierRefusal) {
      return tierRefusal;
    }

    if (internal) {
      return actor.permissions.includes(PERMISSIONS.CALL_INITIATE)
        ? null
        : 'Starting a support call needs the call:initiate permission';
    }
    // A client. They may ask for a call about their own ticket, and only when the product says a
    // requester may — which is off by default, because a button that rings a developer is not
    // something to switch on by accident.
    if (ticket.clientOrganizationId !== actor.organizationId) {
      return 'This ticket belongs to another organization';
    }
    return policy.requesterInitiateEnabled
      ? null
      : 'This product does not offer calls started by the person who raised the ticket';
  }

  private assertMayInitiate(
    actor: AuthenticatedUser,
    clientOrganizationId: string,
    requesterId: string | null,
  ): void {
    if (isInternalUser(actor)) {
      if (!actor.permissions.includes(PERMISSIONS.CALL_INITIATE)) {
        throw new ForbiddenException('This needs the call:initiate permission');
      }
      return;
    }
    if (clientOrganizationId !== actor.organizationId || requesterId !== actor.userId) {
      throw new NotFoundException('Call not found');
    }
  }

  private policyFor(ticket: TicketSummaryRow): Promise<EffectiveIvrPolicy | null> {
    return ticket.productId
      ? this.policies.effectiveFor(ticket.organizationId, ticket.productId)
      : Promise.resolve(null);
  }
}
