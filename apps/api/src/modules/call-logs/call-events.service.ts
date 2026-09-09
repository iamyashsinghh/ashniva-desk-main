import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CALL_STATUS,
  EVENT_STATUS,
  canTransitionCall,
  isCallTerminal,
  mapCallDisposition,
  shouldTryNextDestination,
  type CallStatus,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { IVR_PROVIDER, type IvrCallEvent, type IvrProvider } from '../ivr/ivr-provider.interface';
import { CallLogsRepository, type CallRow } from './call-logs.repository';
import { CallPlacementService } from './call-placement.service';

/**
 * Applying what the provider tells us.
 *
 * Everything here assumes deliveries arrive late, twice, and out of order, because they do. Three
 * mechanisms handle that, and each covers a case the others do not:
 *
 *  * the delivery is recorded against a unique key before this service sees it, so a straight
 *    redelivery never gets here at all;
 *  * every status move goes through `canTransitionCall`, so an event that would move a call
 *    backwards — a `no_answer` overtaking the `answered` for the same ring — is refused by the
 *    lifecycle graph rather than by a guess;
 *  * the move itself is a conditional update on the status the caller read, so two deliveries
 *    racing each other produce one winner and one no-op.
 *
 * The tenant is never read from the payload. It comes from the call row the provider's own call
 * id resolves to, and the caller has already proved which tenant signed the delivery.
 */
@Injectable()
export class CallEventsService {
  constructor(
    private readonly calls: CallLogsRepository,
    private readonly placement: CallPlacementService,
    private readonly auditLog: AuditLogService,
    private readonly logger: PinoLogger,
    @Inject(IVR_PROVIDER) private readonly provider: IvrProvider,
  ) {
    this.logger.setContext(CallEventsService.name);
  }

  /**
   * Finds the call an event is about.
   *
   * The live leg first, then any earlier one: the call row carries only the latest attempt's
   * provider id, so an event about a destination that has already been given up on would
   * otherwise look like an unknown call — and an unknown delivery is one the provider keeps
   * retrying forever.
   */
  async correlate(organizationId: string, providerCallId: string): Promise<CallRow | null> {
    const call = await this.calls.findByProviderCallId(this.provider.key, providerCallId);
    const found = call ?? (await this.calls.findByAttemptProviderCallId(providerCallId));
    if (!found) {
      return null;
    }
    if (found.organizationId !== organizationId) {
      // A verified delivery from one tenant naming another tenant's call. That is a spoof, not a
      // routing hint, and the only safe answer is to act as though the call does not exist.
      this.logger.warn(
        { providerCallId, claimed: organizationId },
        'An IVR delivery named a call belonging to another organization',
      );
      return null;
    }
    return found;
  }

  /** Applies one event. Returns whether anything changed, for the log. */
  async apply(call: CallRow, event: IvrCallEvent): Promise<boolean> {
    switch (event.type) {
      case 'recording.ready':
        return this.attachRecording(call, event);
      case 'call.ended':
        return this.end(call, event);
      default:
        return this.move(call, event);
    }
  }

  /**
   * `call.started`, `call.answered`, `call.no_answer`.
   *
   * The distinction that matters: **`no_answer` is about one leg, not about the call.** A
   * destination that did not pick up has not ended the call — it has ended this attempt at it, and
   * the ladder still has people to try. Marking the call itself `NO_ANSWER` here would make it
   * terminal, and the fallback that runs next would find a finished call and stand down, which is
   * precisely the silent drop this package exists to prevent. The call only becomes `NO_ANSWER`
   * when the ladder runs out, and `CallPlacementService` is what decides that.
   */
  private async move(call: CallRow, event: IvrCallEvent): Promise<boolean> {
    const to = EVENT_STATUS[event.type];
    if (!to) {
      return false;
    }
    const from = call.status as CallStatus;
    if (!canTransitionCall(from, to)) {
      // Not an error: a stale or duplicate event that the graph refuses is exactly what the
      // graph is for.
      this.logger.debug({ callId: call.id, from, to }, 'Ignored an out-of-order IVR event');
      return false;
    }

    if (to === CALL_STATUS.NO_ANSWER) {
      return this.legFailed(call, CALL_STATUS.NO_ANSWER, event);
    }

    const connectedUserId =
      to === CALL_STATUS.CONNECTED ? (await this.calls.liveAttempt(call.id))?.targetUserId : null;

    const moved = await this.calls.transition(call.id, from, {
      status: to,
      ...(to === CALL_STATUS.RINGING ? { ringingAt: event.occurredAt } : {}),
      ...(to === CALL_STATUS.CONNECTED
        ? { connectedAt: event.occurredAt, connectedUserId: connectedUserId ?? null }
        : {}),
    });
    if (!moved) {
      return false;
    }

    if (to === CALL_STATUS.CONNECTED) {
      await this.finishLiveAttempt(call, CALL_STATUS.CONNECTED, event.occurredAt);
      await this.audit(call, AUDIT_ACTION.CALL_CONNECTED, { connectedUserId });
    }
    return true;
  }

  /**
   * One destination did not work out. Close its leg and let the ladder decide what happens next.
   *
   * The call's own status is left alone deliberately — see `move`. `advance` either rings somebody
   * else or ends the call with a stated reason and tells the support queue.
   */
  private async legFailed(
    call: CallRow,
    status: CallStatus,
    event: IvrCallEvent,
  ): Promise<boolean> {
    await this.finishLiveAttempt(call, status, event.occurredAt);
    if (event.disposition) {
      await this.calls.update(call.id, { providerDisposition: event.disposition });
    }
    await this.placement.advance(call.organizationId, call.id);
    return true;
  }

  /**
   * `call.ended`: what a call becomes depends on whether anybody was ever on it.
   *
   * The provider's own word for how it ended is kept beside the mapped status, unmapped, because
   * whoever reads the history may know what their provider meant by it.
   */
  private async end(call: CallRow, event: IvrCallEvent): Promise<boolean> {
    const wasAnswered = call.connectedAt !== null || call.status === CALL_STATUS.CONNECTED;
    const to = mapCallDisposition(event.disposition, wasAnswered);
    const from = call.status as CallStatus;
    if (isCallTerminal(from) || !canTransitionCall(from, to)) {
      this.logger.debug({ callId: call.id, from, to }, 'Ignored an out-of-order IVR end event');
      return false;
    }

    // A leg that ended without ever being answered is a fallback cause, not a conclusion. The
    // call stays live and the ladder is asked for the next destination.
    if (!wasAnswered && shouldTryNextDestination(to)) {
      return this.legFailed(call, to, event);
    }

    const moved = await this.calls.transition(call.id, from, {
      status: to,
      providerDisposition: event.disposition ?? null,
      endedAt: event.occurredAt,
      durationSeconds: event.durationSeconds ?? durationOf(call, event.occurredAt),
    });
    if (!moved) {
      return false;
    }
    await this.finishLiveAttempt(call, to, event.occurredAt);
    await this.audit(call, AUDIT_ACTION.CALL_COMPLETED, {
      status: to,
      disposition: event.disposition ?? null,
    });
    return true;
  }

  /**
   * `recording.ready`: attach the reference and nothing else.
   *
   * No status changes — a recording arriving says nothing about how the call went — and no audio
   * is copied. Desk stores what the provider holds, so there is one copy of a recording in the
   * world and it stays where the retention policy that governs it already applies.
   */
  private async attachRecording(call: CallRow, event: IvrCallEvent): Promise<boolean> {
    if (!event.recordingRef || call.recordingRef !== null) {
      return false;
    }
    if (!call.recordingConsent) {
      // The provider recorded something Desk did not ask for. Storing the reference anyway would
      // make Desk the reason it is retrievable, which is exactly what the consent flag is for.
      this.logger.warn(
        { callId: call.id },
        'An IVR recording arrived for a call that was not to be recorded; the reference was discarded',
      );
      return false;
    }
    await this.calls.update(call.id, {
      recordingRef: event.recordingRef,
      recordingReadyAt: event.occurredAt,
    });
    await this.audit(call, AUDIT_ACTION.CALL_RECORDING_AVAILABLE, {});
    return true;
  }

  private async finishLiveAttempt(call: CallRow, status: CallStatus, at: Date): Promise<void> {
    const attempt = await this.calls.liveAttempt(call.id);
    if (attempt) {
      await this.calls.finishAttempt(attempt.id, { status, endedAt: at });
    }
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

/** How long the call lasted, when the provider did not say. */
function durationOf(call: CallRow, endedAt: Date): number | null {
  if (!call.connectedAt) {
    return null;
  }
  return Math.max(0, Math.round((endedAt.getTime() - call.connectedAt.getTime()) / 1000));
}
