import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  INCIDENT_LINK_KIND,
  INCIDENT_STATUS,
  INCIDENT_TIMELINE_KIND,
  type AuthenticatedUser,
  type IncidentDetail,
  type IncidentStatus,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import type {
  AddIncidentLinkDto,
  AddIncidentNoteDto,
  CloseIncidentDto,
  PublishClientSummaryDto,
  ResolveIncidentDto,
} from './dto/incident.dto';
import { IncidentsService } from './incidents.service';
import { IncidentsRepository } from './incidents.repository';

/**
 * Ending an incident and telling people about it: resolution, closure, notes, links, and the
 * client summary. The emergency-fix gate is next door in `EmergencyFixService`.
 *
 * Every action here writes a timeline entry, and the ones that matter to somebody outside the
 * incident write an audit row as well. They are not the same record: the timeline is the
 * incident's own account of itself, read by whoever is working it; the audit log is the
 * organization's, read months later.
 */
@Injectable()
export class IncidentActionsService {
  constructor(
    private readonly incidents: IncidentsRepository,
    private readonly service: IncidentsService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** The impact ended. The clock stops here; the follow-up is what `close` finishes. */
  async resolve(
    actor: AuthenticatedUser,
    id: string,
    dto: ResolveIncidentDto,
  ): Promise<IncidentDetail> {
    const incident = await this.service.require(actor, id);
    const from = incident.status as IncidentStatus;
    this.service.assertMove(from, INCIDENT_STATUS.RESOLVED);
    const resolution = dto.resolution.trim();
    const applied = await this.incidents.apply({
      organizationId: actor.organizationId,
      id,
      expect: { status: from },
      data: {
        status: INCIDENT_STATUS.RESOLVED,
        resolution,
        resolvedAt: new Date(),
        resolvedById: actor.userId,
      },
      entries: [
        {
          kind: INCIDENT_TIMELINE_KIND.RESOLVED,
          body: `Resolved: ${resolution}`,
          actorId: actor.userId,
        },
      ],
    });
    if (!applied) {
      throw new ConflictException('Somebody else moved this incident; reload and try again');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.INCIDENT_RESOLVED,
      entityType: AUDIT_ENTITY_TYPE.INCIDENT,
      entityId: id,
      organizationId: actor.organizationId,
      after: { from, resolution },
    });
    return this.service.get(actor, id);
  }

  /** The follow-up is done. Reopening is a new incident, so this one's timeline keeps meaning. */
  async close(
    actor: AuthenticatedUser,
    id: string,
    dto: CloseIncidentDto,
  ): Promise<IncidentDetail> {
    const incident = await this.service.require(actor, id);
    const from = incident.status as IncidentStatus;
    this.service.assertMove(from, INCIDENT_STATUS.CLOSED);
    const note = dto.note?.trim();
    const applied = await this.incidents.apply({
      organizationId: actor.organizationId,
      id,
      expect: { status: from },
      data: { status: INCIDENT_STATUS.CLOSED, closedAt: new Date() },
      entries: [
        {
          kind: INCIDENT_TIMELINE_KIND.CLOSED,
          body: note ? `Closed: ${note}` : 'Closed',
          actorId: actor.userId,
        },
      ],
    });
    if (!applied) {
      throw new ConflictException('Somebody else moved this incident; reload and try again');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.INCIDENT_CLOSED,
      entityType: AUDIT_ENTITY_TYPE.INCIDENT,
      entityId: id,
      organizationId: actor.organizationId,
      after: { note: note ?? null },
    });
    return this.service.get(actor, id);
  }

  /** A responder's own words, appended. Nothing else in the timeline is written by hand. */
  async addNote(
    actor: AuthenticatedUser,
    id: string,
    dto: AddIncidentNoteDto,
  ): Promise<IncidentDetail> {
    await this.service.require(actor, id);
    const applied = await this.incidents.apply({
      organizationId: actor.organizationId,
      id,
      data: {},
      entries: [
        { kind: INCIDENT_TIMELINE_KIND.NOTE, body: dto.body.trim(), actorId: actor.userId },
      ],
    });
    if (!applied) {
      throw new NotFoundException('Incident not found');
    }
    return this.service.get(actor, id);
  }

  /** One ticket, task or release the incident touches. */
  async addLink(
    actor: AuthenticatedUser,
    id: string,
    dto: AddIncidentLinkDto,
  ): Promise<IncidentDetail> {
    await this.service.require(actor, id);
    const ids = linkIdsFor(dto);
    const target = await this.incidents.findLinkTarget(actor.organizationId, ids);
    if (!target) {
      throw new NotFoundException('That item was not found');
    }
    await this.incidents.addLink({
      organizationId: actor.organizationId,
      incidentId: id,
      kind: dto.kind,
      ...ids,
      addedById: actor.userId,
      body: `Linked ${target.label}`,
    });
    return this.service.get(actor, id);
  }

  /**
   * Tells the clients on this incident's project what happened.
   *
   * Nothing publishes this automatically and nothing writes it: a person types the wording and a
   * person presses the button. Until `clientSummaryPublishedAt` is set the text reaches no client
   * at all, and publishing writes a timeline entry and an audit row so that "who decided to tell
   * them, and what exactly did we say" survives the next edit of the draft.
   */
  async publishClientSummary(
    actor: AuthenticatedUser,
    id: string,
    dto: PublishClientSummaryDto,
  ): Promise<IncidentDetail> {
    const incident = await this.service.require(actor, id);
    const summary = (dto.clientSummary ?? incident.clientSummary ?? '').trim();
    if (summary.length === 0) {
      throw new BadRequestException('Write the client summary before publishing it');
    }
    const publishedAt = new Date();
    const applied = await this.incidents.apply({
      organizationId: actor.organizationId,
      id,
      data: { clientSummary: summary, clientSummaryPublishedAt: publishedAt },
      entries: [
        {
          kind: INCIDENT_TIMELINE_KIND.CLIENT_SUMMARY_PUBLISHED,
          body: 'Client summary published',
          actorId: actor.userId,
        },
      ],
    });
    if (!applied) {
      throw new NotFoundException('Incident not found');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.INCIDENT_CLIENT_SUMMARY_PUBLISHED,
      entityType: AUDIT_ENTITY_TYPE.INCIDENT,
      entityId: id,
      organizationId: actor.organizationId,
      // The published wording itself, because that is the thing a client was told.
      after: { clientSummary: summary, publishedAt: publishedAt.toISOString() },
    });
    return this.service.get(actor, id);
  }
}

/** Exactly one id, and it has to be the one `kind` names. */
function linkIdsFor(dto: AddIncidentLinkDto): {
  ticketId?: string;
  taskId?: string;
  releaseId?: string;
} {
  const given = [dto.ticketId, dto.taskId, dto.releaseId].filter(Boolean);
  if (given.length !== 1) {
    throw new BadRequestException('Give exactly one of ticketId, taskId or releaseId');
  }
  if (dto.kind === INCIDENT_LINK_KIND.TICKET && dto.ticketId) {
    return { ticketId: dto.ticketId };
  }
  if (dto.kind === INCIDENT_LINK_KIND.TASK && dto.taskId) {
    return { taskId: dto.taskId };
  }
  if (dto.kind === INCIDENT_LINK_KIND.RELEASE && dto.releaseId) {
    return { releaseId: dto.releaseId };
  }
  throw new BadRequestException(`A ${dto.kind} link must carry the matching id`);
}
