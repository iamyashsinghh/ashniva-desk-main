import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  EMERGENCY_FIX_STATUS,
  INCIDENT_TIMELINE_KIND,
  PERMISSIONS,
  canDecideEmergencyFix,
  canRequestEmergencyFix,
  type AuthenticatedUser,
  type EmergencyFixStatus,
  type IncidentDetail,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import type { EmergencyFixDecisionDto, EmergencyFixRequestDto } from './dto/incident.dto';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

/**
 * Shipping outside the release process, and who said it was allowed.
 *
 * Its own service because it is the one action in the package that authorises a production change
 * nobody planned: two permissions, one request, one decision, a reason on both, and a record in
 * two places. Everything it writes goes into the incident's timeline *and* into the audit log,
 * and they are not the same record — the timeline is read by whoever is working the incident, the
 * audit log by somebody months later asking who authorised this at two in the morning.
 */
@Injectable()
export class EmergencyFixService {
  constructor(
    private readonly incidents: IncidentsRepository,
    private readonly service: IncidentsService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Asks for permission to ship outside the release process.
   *
   * Once per incident. A rejection is a decision, and re-requesting until somebody says yes is
   * exactly what an approval gate exists to prevent; a genuinely changed situation is a new
   * incident, which is also how the timeline stays readable.
   */
  async request(
    actor: AuthenticatedUser,
    id: string,
    dto: EmergencyFixRequestDto,
  ): Promise<IncidentDetail> {
    const incident = await this.service.require(actor, id);
    const status = incident.emergencyFixStatus as EmergencyFixStatus;
    if (!canRequestEmergencyFix(status)) {
      throw new ConflictException(
        'An emergency fix has already been asked for on this incident; open a new one if the situation has changed',
      );
    }
    const reason = dto.reason.trim();
    const applied = await this.incidents.apply({
      organizationId: actor.organizationId,
      id,
      expect: { emergencyFixStatus: EMERGENCY_FIX_STATUS.NONE },
      data: {
        emergencyFixStatus: EMERGENCY_FIX_STATUS.REQUESTED,
        emergencyFixReason: reason,
        emergencyFixRequestedById: actor.userId,
      },
      entries: [
        {
          kind: INCIDENT_TIMELINE_KIND.EMERGENCY_FIX_REQUESTED,
          body: `Emergency fix requested: ${reason}`,
          actorId: actor.userId,
        },
      ],
    });
    if (!applied) {
      throw new ConflictException('An emergency fix was requested a moment ago');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.INCIDENT_EMERGENCY_FIX_REQUESTED,
      entityType: AUDIT_ENTITY_TYPE.INCIDENT,
      entityId: id,
      organizationId: actor.organizationId,
      after: { reason },
    });
    return this.service.get(actor, id);
  }

  /**
   * Approves or refuses that request.
   *
   * Two things have to be true, and neither is the other: the person deciding holds
   * `incident:approve-emergency-fix`, and they said why. The approval sheet states the
   * consequence — it skips the scheduled release and still owes a production smoke test — so an
   * approval nobody explained is exactly the record a later review cannot use.
   */
  async decide(
    actor: AuthenticatedUser,
    id: string,
    dto: EmergencyFixDecisionDto,
  ): Promise<IncidentDetail> {
    const incident = await this.service.require(actor, id);
    if (!actor.permissions.includes(PERMISSIONS.INCIDENT_APPROVE_EMERGENCY_FIX)) {
      throw new ForbiddenException(
        'Deciding an emergency fix needs incident:approve-emergency-fix',
      );
    }
    if (!canDecideEmergencyFix(incident.emergencyFixStatus as EmergencyFixStatus)) {
      throw new ConflictException('There is no emergency fix waiting for a decision here');
    }
    const reason = dto.reason.trim();
    if (reason.length === 0) {
      throw new BadRequestException('An emergency-fix decision has to say why');
    }
    const approved = dto.decision === 'APPROVED';
    const applied = await this.incidents.apply({
      organizationId: actor.organizationId,
      id,
      expect: { emergencyFixStatus: EMERGENCY_FIX_STATUS.REQUESTED },
      data: {
        emergencyFixStatus: approved
          ? EMERGENCY_FIX_STATUS.APPROVED
          : EMERGENCY_FIX_STATUS.REJECTED,
        emergencyFixDecidedById: actor.userId,
        emergencyFixDecidedAt: new Date(),
      },
      entries: [
        {
          kind: approved
            ? INCIDENT_TIMELINE_KIND.EMERGENCY_FIX_APPROVED
            : INCIDENT_TIMELINE_KIND.EMERGENCY_FIX_REJECTED,
          body: `${approved ? 'Emergency fix approved' : 'Emergency fix refused'}: ${reason}`,
          actorId: actor.userId,
        },
      ],
    });
    if (!applied) {
      throw new ConflictException('That request was decided a moment ago');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.INCIDENT_EMERGENCY_FIX_DECIDED,
      entityType: AUDIT_ENTITY_TYPE.INCIDENT,
      entityId: id,
      organizationId: actor.organizationId,
      after: { decision: dto.decision, reason },
    });
    return this.service.get(actor, id);
  }
}
