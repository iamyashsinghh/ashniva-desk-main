import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  INTERNAL_CALL_FALLBACK,
  RECORDING_PLAYBACK_SCOPE,
  RECORDING_POLICY,
  type AuthenticatedUser,
  type CommunicationSettingsSummary,
  type InternalCallFallback,
  type RecordingPlaybackScope,
  type RecordingPolicy,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { SaveCommunicationSettingsDto } from './dto/communication.dto';

/** The switches, with defaults filled in. */
export interface CommunicationFlags {
  chatEnabled: boolean;
  callingEnabled: boolean;
  recordingPolicy: RecordingPolicy;
  recordingPlaybackScope: RecordingPlaybackScope;
  internalCallFallback: InternalCallFallback;
}

/**
 * The defaults an organization that has never configured anything gets.
 *
 * Chat on, calling off. A new table must not start telephones ringing: calling costs money and
 * reaches people's phones, and neither should begin because a migration ran. Recording off for
 * the same reason, and playback at its narrowest.
 */
export const DEFAULT_COMMUNICATION_FLAGS: CommunicationFlags = {
  chatEnabled: true,
  callingEnabled: false,
  recordingPolicy: RECORDING_POLICY.DISABLED,
  recordingPlaybackScope: RECORDING_PLAYBACK_SCOPE.LEADS_ONLY,
  internalCallFallback: INTERNAL_CALL_FALLBACK.NONE,
};

/**
 * One organization's internal chat and calling switches.
 *
 * "Not configured" is not a third state: an organization with no row behaves exactly as one that
 * saved the defaults, which is how a feature avoids acquiring different behaviour on the day
 * somebody first opens its settings screen.
 */
@Injectable()
export class CommunicationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** The flags the policy needs. Read fresh: turning chat off has to take effect at once. */
  async flagsFor(organizationId: string): Promise<CommunicationFlags> {
    const row = await this.prisma.communicationSettings.findUnique({
      where: { organizationId },
    });
    if (!row) {
      return DEFAULT_COMMUNICATION_FLAGS;
    }
    return {
      chatEnabled: row.chatEnabled,
      callingEnabled: row.callingEnabled,
      recordingPolicy: row.recordingPolicy as RecordingPolicy,
      recordingPlaybackScope: row.recordingPlaybackScope as RecordingPlaybackScope,
      internalCallFallback: row.internalCallFallback as InternalCallFallback,
    };
  }

  async read(actor: AuthenticatedUser): Promise<CommunicationSettingsSummary> {
    this.assertInternal(actor);
    const row = await this.prisma.communicationSettings.findUnique({
      where: { organizationId: actor.organizationId },
    });
    const flags = await this.flagsFor(actor.organizationId);
    return {
      organizationId: actor.organizationId,
      ...flags,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async save(
    actor: AuthenticatedUser,
    dto: SaveCommunicationSettingsDto,
  ): Promise<CommunicationSettingsSummary> {
    this.assertInternal(actor);
    await this.prisma.communicationSettings.upsert({
      where: { organizationId: actor.organizationId },
      // Only the fields the caller sent: a partial save must not reset a recording scope somebody
      // narrowed deliberately, and `undefined` is how Prisma is told to leave a column alone.
      create: {
        organizationId: actor.organizationId,
        ...dto,
        updatedById: actor.userId,
      },
      update: { ...dto, updatedById: actor.userId },
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.CONVERSATION_SETTINGS_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
      entityId: actor.organizationId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { ...dto },
    });
    return this.read(actor);
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Internal communication settings are internal');
    }
  }
}
