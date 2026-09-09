import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PERMISSIONS,
  RECORDING_DENIAL_REASON,
  RECORDING_DENIAL_REASON_LABELS,
  canPlayRecording,
  type AuthenticatedUser,
  type CallRecordingAccess,
  type ProjectMemberRole,
  type RecordingAccessDecision,
  type RecordingPlaybackScope,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AppConfigService } from '../../config/app-config.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { IvrConnectionService } from '../ivr/ivr-connection.service';
import { IvrPolicyService } from '../ivr/ivr-policy.service';
import {
  IVR_PROVIDER,
  type IvrProvider,
  UNCONFIGURED_IVR_ACCOUNT,
} from '../ivr/ivr-provider.interface';
import { TicketsService } from '../tickets/tickets.service';
import { CallLogsRepository, type CallRow } from './call-logs.repository';

/**
 * Who may hear a client's voice.
 *
 * The decision itself is `canPlayRecording` in packages/types, which is pure and unit-tested
 * against every branch. This service's job is to gather the four facts that decision needs —
 * whether the caller is internal, what they hold, what they are on this project, and what the
 * product's policy allows — and then to write down that they asked.
 *
 * Two rules hold here and are worth stating plainly:
 *
 *  1. The check runs on the server, on every read, for every caller. The web app calls the same
 *     function to decide whether to draw a control, but hiding a control is decoration; this is
 *     the control.
 *  2. Every playback is audited, including — especially including — playback by the most
 *     privileged roles. A recording somebody can listen to without leaving a trace is a recording
 *     nobody is accountable for.
 */
@Injectable()
export class CallRecordingService {
  constructor(
    private readonly calls: CallLogsRepository,
    private readonly policies: IvrPolicyService,
    private readonly auditLog: AuditLogService,
    private readonly connections: IvrConnectionService,
    private readonly tickets: TicketsService,
    private readonly config: AppConfigService,
    @Inject(IVR_PROVIDER) private readonly provider: IvrProvider,
  ) {}

  /**
   * Whether this caller could play this call's recording, without playing it.
   *
   * Used by the call-history mapper so the screen can say "you may not play this, because…"
   * rather than offering a control that fails. Writes nothing and audits nothing: wanting to know
   * whether a button should appear is not an access to a recording.
   */
  async decide(actor: AuthenticatedUser, call: CallRow): Promise<RecordingAccessDecision> {
    const decisions = await this.decideAll(actor, [call]);
    return (
      decisions.get(call.id) ?? { allowed: false, reason: RECORDING_DENIAL_REASON.NO_RECORDING }
    );
  }

  /**
   * The same decision for a whole call history, in a fixed number of queries.
   *
   * The two facts that need a database — the product's playback scope and the caller's role on
   * the project — are the same for every call on one ticket, so they are fetched once per distinct
   * product and project rather than once per call. Deciding call by call would make the number of
   * queries depend on how often somebody had been telephoned.
   */
  async decideAll(
    actor: AuthenticatedUser,
    calls: readonly CallRow[],
  ): Promise<Map<string, RecordingAccessDecision>> {
    // The call's own tenant, not the caller's: a client user's organization is their own
    // company, and the product whose policy governs this recording belongs to the provider.
    const scopes = new Map<string, RecordingPlaybackScope | undefined>();
    for (const productId of new Set(
      calls.map((call) => call.productId).filter((id): id is string => id !== null),
    )) {
      const organizationId = calls.find((call) => call.productId === productId)
        ?.organizationId as string;
      scopes.set(
        productId,
        (await this.policies.effectiveFor(organizationId, productId))?.recordingPlaybackScope,
      );
    }

    const roles = new Map<string, ProjectMemberRole | null>();
    for (const projectId of new Set(
      calls
        .map((call) => call.projectId ?? call.ticket?.projectId ?? null)
        .filter((id): id is string => id !== null),
    )) {
      const role = await this.calls.projectRoleOf(projectId, actor.userId);
      roles.set(projectId, (role as ProjectMemberRole | null) ?? null);
    }

    const isInternal = isInternalUser(actor);
    const hasPlaybackPermission = actor.permissions.includes(PERMISSIONS.CALL_PLAY_RECORDING);
    const administersIvr = actor.permissions.includes(PERMISSIONS.IVR_MANAGE);

    return new Map(
      calls.map((call) => {
        const projectId = call.projectId ?? call.ticket?.projectId ?? null;
        return [
          call.id,
          canPlayRecording({
            isInternal,
            hasPlaybackPermission,
            administersIvr,
            projectRole: projectId ? (roles.get(projectId) ?? null) : null,
            isConnectedStaff: call.connectedUserId === actor.userId,
            scope: (call.productId ? scopes.get(call.productId) : undefined) ?? 'LEADS_ONLY',
            hasRecording: call.recordingRef !== null,
          }),
        ];
      }),
    );
  }

  /**
   * Hand over a playable URL, having decided and written it down.
   *
   * The URL is minted and short-lived rather than stored, and the audio itself is never copied
   * into Desk: what Desk holds is a reference to what the provider holds. That keeps one copy of
   * a recording in the world instead of two, and it keeps the copy where the retention policy
   * that governs it already applies.
   */
  async play(actor: AuthenticatedUser, callId: string): Promise<CallRecordingAccess> {
    const organizationId = await this.tickets.providerId(actor);
    const call = await this.calls.find(organizationId, callId);
    if (!call) {
      // 404 rather than 403 for a call in another tenant, so ids cannot be probed.
      throw new NotFoundException('Call not found');
    }

    const decision = await this.decide(actor, call);
    if (!decision.allowed) {
      // The refusal is audited too. A pattern of refusals is exactly the thing somebody would
      // want to see later, and it is invisible if only successes are recorded.
      await this.audit(actor, call, AUDIT_ACTION.CALL_RECORDING_ACCESS_DENIED, {
        reason: decision.reason,
      });
      throw new ForbiddenException(
        decision.reason
          ? RECORDING_DENIAL_REASON_LABELS[decision.reason]
          : 'You may not play this recording',
      );
    }

    await this.audit(actor, call, AUDIT_ACTION.CALL_RECORDING_ACCESSED, {
      // The reference, not the audio and not a URL: an audit row is read by people who are not
      // allowed to play the recording it describes.
      recordingRef: call.recordingRef,
      connectedUserId: call.connectedUserId,
    });

    const ttl = this.config.ivr.recordingUrlTtlSeconds;
    const account = await this.connections.account(call.organizationId);
    const link = await this.provider.recordingUrl(
      call.recordingRef as string,
      account ?? UNCONFIGURED_IVR_ACCOUNT,
      ttl,
    );
    return { callId: call.id, url: link.url, expiresAt: link.expiresAt.toISOString() };
  }

  private audit(
    actor: AuthenticatedUser,
    call: CallRow,
    action: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    return this.auditLog.record({
      action,
      entityType: AUDIT_ENTITY_TYPE.CALL,
      entityId: call.id,
      organizationId: call.organizationId,
      actorUserId: actor.userId,
      after: { ticketId: call.ticketId, ...after },
    });
  }
}
