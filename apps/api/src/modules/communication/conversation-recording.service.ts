import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  COMMUNICATION_ACTION,
  PERMISSIONS,
  RECORDING_DENIAL_REASON_LABELS,
  canPlayRecording,
  type AuthenticatedUser,
  type CallRecordingAccess,
  type ProjectMemberRole,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AppConfigService } from '../../config/app-config.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CallLogsRepository } from '../call-logs/call-logs.repository';
import { IvrConnectionService } from '../ivr/ivr-connection.service';
import {
  IVR_PROVIDER,
  type IvrProvider,
  UNCONFIGURED_IVR_ACCOUNT,
} from '../ivr/ivr-provider.interface';
import { CommunicationFactsService } from './communication-facts.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { CommunicationSettingsService } from './communication-settings.service';
import { ConversationsRepository } from './conversations.repository';

/**
 * Playing back an internal call.
 *
 * **Being on a call is not a reason to be able to listen to it again.** That is the whole of this
 * file, and it is the opposite of what a naive implementation does. Two independent gates stand
 * between somebody and the audio:
 *
 *  1. `canCommunicate(PLAY_RECORDING)` — do you belong in this conversation at all, and do you
 *     hold `conversation:recording-play`? The permission is not part of the developer or tester
 *     role, so participating grants nothing.
 *  2. `canPlayRecording` — the *same* shared function package 9 uses for support recordings,
 *     applied against the organization's playback scope and the caller's role on the project.
 *     Reusing it rather than restating it is deliberate: two copies of this rule would drift, and
 *     the drift would be in who may hear a colleague's voice.
 *
 * Every playback and every refusal is audited, including — especially including — by a super
 * admin. Oversight that leaves no trace is indistinguishable from a breach.
 */
@Injectable()
export class ConversationRecordingService {
  constructor(
    private readonly calls: CallLogsRepository,
    private readonly conversations: ConversationsRepository,
    private readonly policy: CommunicationPolicyService,
    private readonly facts: CommunicationFactsService,
    private readonly settings: CommunicationSettingsService,
    private readonly connections: IvrConnectionService,
    private readonly config: AppConfigService,
    private readonly auditLog: AuditLogService,
    @Inject(IVR_PROVIDER) private readonly provider: IvrProvider,
  ) {}

  async play(actor: AuthenticatedUser, callId: string): Promise<CallRecordingAccess> {
    if (!isInternalUser(actor)) {
      // A client has no path to an internal recording, and never gets far enough to be told why.
      throw new NotFoundException('Call not found');
    }
    const call = await this.calls.find(actor.organizationId, callId);
    if (!call || call.kind !== 'INTERNAL' || !call.conversationId) {
      throw new NotFoundException('Call not found');
    }
    const row = await this.conversations.find(actor.organizationId, call.conversationId);
    if (!row) {
      throw new NotFoundException('Call not found');
    }

    const counterpart = row.members.find((member) => member.userId !== actor.userId)?.userId;
    const context = {
      projectId: row.projectId,
      taskId: row.taskId,
      ticketId: row.ticketId,
      ...(row.kind === 'DIRECT' && counterpart ? { withUserId: counterpart } : {}),
    };

    // Gate one: do you belong here, and do you hold the playback permission?
    const belongs = await this.policy.decide(actor, COMMUNICATION_ACTION.PLAY_RECORDING, context);
    // Gate two: does the organization's scope admit your role on this project?
    const flags = await this.settings.flagsFor(actor.organizationId);
    const projectRole = await this.facts.projectRole(row.projectId, actor.userId);
    const audio = canPlayRecording({
      isInternal: true,
      hasPlaybackPermission: actor.permissions.includes(PERMISSIONS.CONVERSATION_RECORDING_PLAY),
      // Whoever administers the switches may hear what they produced; withholding that from the
      // one role accountable for the policy would make the policy unauditable.
      administersIvr: actor.permissions.includes(PERMISSIONS.CONVERSATION_SETTINGS_MANAGE),
      projectRole: projectRole as ProjectMemberRole | null,
      isConnectedStaff: call.connectedUserId === actor.userId,
      scope: flags.recordingPlaybackScope,
      hasRecording: call.recordingRef !== null,
    });

    if (!belongs.allowed || !audio.allowed) {
      await this.audit(actor, call.id, AUDIT_ACTION.CALL_RECORDING_ACCESS_DENIED, {
        conversationId: row.id,
        projectId: row.projectId,
        reason: belongs.allowed ? audio.reason : belongs.reason,
        viaOversight: belongs.viaOversight,
      });
      throw new ForbiddenException(
        audio.reason
          ? RECORDING_DENIAL_REASON_LABELS[audio.reason]
          : 'You may not play this recording',
      );
    }

    await this.audit(actor, call.id, AUDIT_ACTION.CALL_RECORDING_ACCESSED, {
      conversationId: row.id,
      projectId: row.projectId,
      // The reference, not the audio and not a URL: an audit row is read by people who are not
      // allowed to play the recording it describes.
      recordingRef: call.recordingRef,
      viaOversight: belongs.viaOversight,
    });

    const ttl = this.config.ivr.recordingUrlTtlSeconds;
    const account = await this.connections.account(actor.organizationId);
    const link = await this.provider.recordingUrl(
      call.recordingRef as string,
      account ?? UNCONFIGURED_IVR_ACCOUNT,
      ttl,
    );
    return { callId: call.id, url: link.url, expiresAt: link.expiresAt.toISOString() };
  }

  private audit(
    actor: AuthenticatedUser,
    callId: string,
    action: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    return this.auditLog.record({
      action,
      entityType: AUDIT_ENTITY_TYPE.CALL,
      entityId: callId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after,
    });
  }
}
