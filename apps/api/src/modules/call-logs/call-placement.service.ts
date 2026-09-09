import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CALL_ROUTING_STEP,
  CALL_STATUS,
  isCallTerminal,
  type CallStatus,
  type CallTargetDecision,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { AuditLogService } from '../audit-logs/audit-log.service';
import {
  IVR_PROVIDER,
  type IvrProvider,
  UNCONFIGURED_IVR_ACCOUNT,
} from '../ivr/ivr-provider.interface';
import { IvrConnectionService } from '../ivr/ivr-connection.service';
import { IvrPolicyService } from '../ivr/ivr-policy.service';
import { TicketsRepository, type TicketSummaryRow } from '../tickets/tickets.repository';
import { CallLogsRepository, type CallRow } from './call-logs.repository';
import { CallNotificationsService } from './call-notifications.service';
import { CallRoutingService } from './call-routing.service';
import { InternalCallAdvancerRegistry } from './internal-call-advancer';

/**
 * Walking the ladder.
 *
 * One method does all of it — the first placement and every fallback after a destination did not
 * answer — because they are the same act: ask who is next, write down that we are trying them,
 * ask the provider to ring them. Two code paths for that would be two chances to drop a call, and
 * a dropped support call is the failure this whole package exists to prevent.
 *
 * Three things bound the loop, and all three are needed:
 *
 *  * `planCallTarget` never returns somebody already rung on this call;
 *  * the policy's attempt ceiling stops it even when eligible people remain;
 *  * the attempt counter is claimed conditionally, so two workers cannot both ring somebody.
 *
 * When it runs out, the call ends with a stated reason and somebody is told. It never ends in
 * silence.
 */
@Injectable()
export class CallPlacementService {
  constructor(
    private readonly calls: CallLogsRepository,
    private readonly routing: CallRoutingService,
    private readonly policies: IvrPolicyService,
    private readonly connections: IvrConnectionService,
    private readonly tickets: TicketsRepository,
    private readonly notifications: CallNotificationsService,
    private readonly auditLog: AuditLogService,
    private readonly internal: InternalCallAdvancerRegistry,
    private readonly logger: PinoLogger,
    @Inject(IVR_PROVIDER) private readonly provider: IvrProvider,
  ) {
    this.logger.setContext(CallPlacementService.name);
  }

  /** Which adapter is placing calls, stamped on every call so a mixed history stays readable. */
  get providerKey(): string {
    return this.provider.key;
  }

  /**
   * Ring the next destination, or stop and say why.
   *
   * Never throws for a call that cannot be placed. A support call that reaches nobody needs a
   * person, not an exception in a queue worker, so every dead end here ends with the call marked,
   * the reason recorded and the support queue notified.
   */
  async advance(organizationId: string, callId: string, now = new Date()): Promise<CallRow> {
    let call = await this.calls.find(organizationId, callId);
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    // An internal call is not this service's to place. Its destination policy is package 9b's —
    // ring the person the call is for, and never redirect a private conversation to a support
    // agent — so the ladder below is handed over rather than applied.
    if (call.kind === 'INTERNAL') {
      await this.internal.get()?.advance(organizationId, callId);
      return (await this.calls.find(organizationId, callId)) ?? call;
    }

    // Support calls always name a ticket; the internal ones were handed over above.
    const ticket = call.ticketId
      ? await this.tickets.findSummary(organizationId, call.ticketId)
      : null;
    const policy = call.productId
      ? await this.policies.effectiveFor(organizationId, call.productId)
      : null;
    if (!ticket || !policy) {
      return this.giveUp(call, 'The ticket or its product is no longer available', now);
    }

    // Bounded by the ceiling rather than `while (true)`: the loop places at most one call per
    // pass through, and every pass consumes an attempt, so it cannot spin.
    for (let guard = 0; guard <= policy.maxAttempts; guard += 1) {
      if (isCallTerminal(call.status as CallStatus)) {
        return call;
      }
      const tried = await this.calls.triedTargets(call.id);
      const decision = await this.routing.plan(
        organizationId,
        ticket,
        policy,
        { alreadyTried: tried, attemptsUsed: call.attemptCount },
        now,
      );

      if (decision.step === CALL_ROUTING_STEP.SUPPORT_QUEUE || !decision.userId) {
        return this.giveUp(call, decision.reason, now);
      }

      const placed = await this.tryDestination(call, ticket, decision, now);
      if (placed) {
        return placed;
      }
      // The provider refused this destination outright. That is a fallback cause like any other,
      // so the loop asks again with this person now among the tried.
      const reread = await this.calls.find(organizationId, callId);
      if (!reread) {
        return call;
      }
      call = reread;
    }

    return this.giveUp(call, 'No destination could be reached', now);
  }

  /** One attempt: claim the number, write it down, ask the provider. Null when it refused. */
  private async tryDestination(
    call: CallRow,
    ticket: TicketSummaryRow,
    decision: CallTargetDecision,
    now: Date,
  ): Promise<CallRow | null> {
    // Any leg still open belongs to a destination that did not work out — otherwise the call
    // would not be here asking for another. Closing it before claiming the next keeps the history
    // honest and stops two attempts looking live at once.
    const open = await this.calls.liveAttempt(call.id);
    if (open) {
      await this.calls.finishAttempt(open.id, { status: CALL_STATUS.NO_ANSWER, endedAt: now });
    }

    const sequence = await this.calls.claimAttempt(call.id, call.attemptCount);
    if (sequence === null) {
      // Somebody else is already ringing somebody for this call. Two destinations at once is
      // worse than one, so this pass stands down.
      this.logger.debug({ callId: call.id }, 'Stood down: another attempt is in flight');
      return call;
    }

    const attempt = await this.calls.recordAttempt({
      organizationId: call.organizationId,
      callId: call.id,
      sequence,
      step: decision.step,
      routingRole: decision.role,
      targetUserId: decision.userId,
      status: CALL_STATUS.RINGING,
      reason: decision.reason,
      startedAt: now,
    });

    await this.audit(
      call,
      sequence === 1 ? AUDIT_ACTION.CALL_TARGET_CHOSEN : AUDIT_ACTION.CALL_FALLBACK_ATTEMPTED,
      {
        attempt: sequence,
        step: decision.step,
        targetUserId: decision.userId,
        reason: decision.reason,
      },
    );

    const account = await this.connections.account(call.organizationId);
    try {
      const result = await this.provider.startOutboundCall({
        organizationId: call.organizationId,
        ticketId: call.ticketId as string,
        agentUserId: decision.userId as string,
        // A masked reference, never a dialable number: the IVR bridges both legs and holds the
        // directory. Desk transmits no telephone number, so it can leak none.
        clientPhoneRef: call.clientPhoneRef ?? '',
        recordingConsent: call.recordingConsent,
        account: account ?? UNCONFIGURED_IVR_ACCOUNT,
      });

      const updated = await this.calls.update(call.id, {
        providerCallId: result.providerCallId,
        status: CALL_STATUS.RINGING,
        ringingAt: result.startedAt,
        lastError: null,
      });
      await this.calls.finishAttempt(attempt.id, { providerCallId: result.providerCallId });
      await this.notifications.incoming(ticket, decision.userId as string, updated);
      return updated;
    } catch (error) {
      // The message is kept short and generic on purpose: a provider error can quote the request
      // it failed on, and that request names a destination. Nothing that could carry a number or
      // a credential goes into a stored field.
      const message = error instanceof Error ? error.name : 'Provider refused the call';
      this.logger.warn(
        { callId: call.id, attempt: sequence, err: error },
        'The IVR provider refused a destination',
      );
      await this.calls.finishAttempt(attempt.id, {
        status: CALL_STATUS.FAILED,
        endedAt: new Date(),
      });
      await this.calls.update(call.id, { lastError: message });
      // Null means "keep walking". The ceiling is not re-checked here: the claim above already
      // consumed an attempt, so the next pass asks `planCallTarget` and gets the support queue
      // once the ceiling is reached — one place decides when to stop, not two.
      return null;
    }
  }

  /** The call is over and nobody was reached. Say so, loudly enough that a person sees it. */
  private async giveUp(call: CallRow, reason: string, now: Date): Promise<CallRow> {
    if (isCallTerminal(call.status as CallStatus)) {
      return call;
    }
    // NO_ANSWER when somebody was rung and did not pick up; FAILED when there was nobody to ring
    // at all. Both are terminal, and the difference is what a person needs to know.
    const status = call.attemptCount > 0 ? CALL_STATUS.NO_ANSWER : CALL_STATUS.FAILED;
    const updated = await this.calls.update(call.id, {
      status,
      queueReason: reason,
      endedAt: call.endedAt ?? now,
    });
    await this.audit(call, AUDIT_ACTION.CALL_COMPLETED, { status, reason });
    await this.notifications.missed(updated, reason);
    return updated;
  }

  private audit(call: CallRow, action: string, after: Record<string, unknown>): Promise<void> {
    return this.auditLog.record({
      action,
      entityType: AUDIT_ENTITY_TYPE.CALL,
      entityId: call.id,
      organizationId: call.organizationId,
      after: { ticketId: call.ticketId, ...after },
    });
  }
}
