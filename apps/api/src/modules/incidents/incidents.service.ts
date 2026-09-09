import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  INCIDENT_STATUS_LABELS,
  INCIDENT_TIMELINE_KIND,
  PRIORITY_LABELS,
  canMoveIncident,
  type AuthenticatedUser,
  type IncidentDetail,
  type IncidentStatus,
  type IncidentSummary,
  type PaginatedResponse,
  type Priority,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import type { Prisma, IncidentTimelineKind } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type {
  CreateIncidentDto,
  ListIncidentsQueryDto,
  UpdateIncidentDto,
} from './dto/incident.dto';
import { incidentKey, toIncidentDetail, toIncidentSummary } from './incidents.mapper';
import { IncidentsRepository, type IncidentDetailRow } from './incidents.repository';

type TimelineEntry = { kind: IncidentTimelineKind; body: string; actorId: string };

/**
 * Reads, opening and editing an incident. The gated actions — the emergency fix, resolution,
 * closure and the client summary — live in `IncidentActionsService`.
 *
 * Incidents are internal end to end. They name what broke, who was affected and which release
 * caused it, so there is no portal counterpart to this service. The one thing a client may ever
 * be told is `clientSummary`, which somebody writes and somebody publishes.
 */
@Injectable()
export class IncidentsService {
  constructor(
    private readonly incidents: IncidentsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListIncidentsQueryDto,
  ): Promise<PaginatedResponse<IncidentSummary>> {
    this.assertInternal(actor);
    const page = await this.incidents.list({
      organizationId: actor.organizationId,
      status: query.status,
      projectId: query.projectId,
      problemId: query.problemId,
      ownerId: query.ownerId,
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    });
    return {
      items: page.items.map((row) => toIncidentSummary(row)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<IncidentDetail> {
    return toIncidentDetail(await this.require(actor, id));
  }

  /**
   * Opens an incident.
   *
   * `startedAt` may be backdated — the impact usually began before anybody noticed — but never
   * post-dated: an incident that has not started yet is a risk, not an incident. `detectedAt` is
   * always now, because now is when somebody did notice.
   */
  async create(actor: AuthenticatedUser, dto: CreateIncidentDto): Promise<IncidentDetail> {
    this.assertInternal(actor);
    const now = new Date();
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : now;
    if (startedAt.getTime() > now.getTime()) {
      throw new BadRequestException('An incident cannot have started in the future');
    }
    await this.assertReferences(actor, dto);

    const row = await this.incidents.create(
      actor.organizationId,
      {
        title: dto.title.trim(),
        description: dto.description.trim(),
        severity: dto.severity,
        impact: dto.impact?.trim() || null,
        projectId: dto.projectId ?? null,
        productId: dto.productId ?? null,
        problemId: dto.problemId ?? null,
        ownerId: dto.ownerId ?? null,
        startedAt,
        detectedAt: now,
        createdById: actor.userId,
      },
      {
        body: `Opened as ${PRIORITY_LABELS[dto.severity]}`,
        actorId: actor.userId,
      },
    );

    if (dto.ticketId) {
      const target = await this.incidents.findLinkTarget(actor.organizationId, {
        ticketId: dto.ticketId,
      });
      if (!target) {
        throw new NotFoundException('Ticket not found');
      }
      await this.incidents.addLink({
        organizationId: actor.organizationId,
        incidentId: row.id,
        kind: 'TICKET',
        ticketId: dto.ticketId,
        addedById: actor.userId,
        body: `Linked ${target.label}`,
      });
    }

    await this.auditLog.record({
      action: AUDIT_ACTION.INCIDENT_OPENED,
      entityType: AUDIT_ENTITY_TYPE.INCIDENT,
      entityId: row.id,
      organizationId: actor.organizationId,
      after: {
        key: incidentKey(row),
        title: row.title,
        severity: row.severity,
        projectId: row.projectId,
        problemId: row.problemId,
      },
    });
    return this.get(actor, row.id);
  }

  /**
   * Edits an incident, including its status.
   *
   * Every field that changes writes a timeline entry, so the timeline is a complete account
   * rather than a partial one. The status move is checked against the transition table first: a
   * machine that lets an incident be closed while it is still investigating teaches people that
   * the statuses mean nothing.
   */
  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateIncidentDto,
  ): Promise<IncidentDetail> {
    const before = await this.require(actor, id);
    const status = before.status as IncidentStatus;
    const data: Prisma.IncidentUncheckedUpdateInput = {};
    const entries: TimelineEntry[] = [];

    if (dto.title !== undefined) {
      data.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim();
    }
    if (dto.impact !== undefined) {
      data.impact = dto.impact.trim() || null;
    }
    if (dto.internalNotes !== undefined) {
      data.internalNotes = dto.internalNotes.trim() || null;
    }
    if (dto.clientSummary !== undefined) {
      // Saved as a draft. Nothing here sets `clientSummaryPublishedAt`.
      data.clientSummary = dto.clientSummary.trim() || null;
    }
    if (dto.severity !== undefined && dto.severity !== before.severity) {
      data.severity = dto.severity;
      entries.push({
        kind: INCIDENT_TIMELINE_KIND.SEVERITY_CHANGED,
        body: `Severity ${PRIORITY_LABELS[before.severity as Priority]} → ${PRIORITY_LABELS[dto.severity]}`,
        actorId: actor.userId,
      });
    }
    if (dto.ownerId !== undefined && dto.ownerId !== before.ownerId) {
      if (dto.ownerId) {
        if (!(await this.incidents.findMember(actor.organizationId, dto.ownerId))) {
          throw new BadRequestException('That person is not a member of this organization');
        }
      }
      data.ownerId = dto.ownerId;
      entries.push({
        kind: INCIDENT_TIMELINE_KIND.OWNER_CHANGED,
        body: dto.ownerId ? 'Owner changed' : 'Owner cleared',
        actorId: actor.userId,
      });
    }
    if (dto.status !== undefined && dto.status !== status) {
      this.assertMove(status, dto.status);
      // Resolving and closing carry a resolution and a closing note, so they are their own
      // endpoints; this path moves an incident through the working statuses only.
      if (dto.status === 'RESOLVED' || dto.status === 'CLOSED') {
        throw new BadRequestException(
          `Use the ${dto.status === 'RESOLVED' ? 'resolve' : 'close'} action, which records why`,
        );
      }
      data.status = dto.status;
      entries.push({
        kind: INCIDENT_TIMELINE_KIND.STATUS_CHANGED,
        body: `${INCIDENT_STATUS_LABELS[status]} → ${INCIDENT_STATUS_LABELS[dto.status]}`,
        actorId: actor.userId,
      });
    }

    if (Object.keys(data).length === 0) {
      return this.get(actor, id);
    }
    const applied = await this.incidents.apply({
      organizationId: actor.organizationId,
      id,
      expect: { status: before.status },
      data,
      entries,
    });
    if (!applied) {
      throw new ConflictException('Somebody else changed this incident; reload and try again');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.INCIDENT_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.INCIDENT,
      entityId: id,
      organizationId: actor.organizationId,
      before: { status: before.status, severity: before.severity, ownerId: before.ownerId },
      after: { status: data.status ?? before.status, severity: data.severity ?? before.severity },
    });
    return this.get(actor, id);
  }

  /** Loads an incident inside the caller's tenant, or reports it as missing. */
  async require(actor: AuthenticatedUser, id: string): Promise<IncidentDetailRow> {
    this.assertInternal(actor);
    const row = await this.incidents.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Incident not found');
    }
    return row;
  }

  assertMove(from: IncidentStatus, to: IncidentStatus): void {
    if (!canMoveIncident(from, to)) {
      throw new ConflictException(
        `An incident that is ${INCIDENT_STATUS_LABELS[from]} cannot become ${INCIDENT_STATUS_LABELS[to]}`,
      );
    }
  }

  assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Incidents are internal');
    }
  }

  /** Each id a caller supplies is resolved inside the tenant before it is written down. */
  private async assertReferences(actor: AuthenticatedUser, dto: CreateIncidentDto): Promise<void> {
    if (dto.projectId && !(await this.incidents.findProject(actor.organizationId, dto.projectId))) {
      throw new NotFoundException('Project not found');
    }
    if (dto.productId && !(await this.incidents.findProduct(actor.organizationId, dto.productId))) {
      throw new NotFoundException('Product not found');
    }
    if (dto.problemId && !(await this.incidents.findProblem(actor.organizationId, dto.problemId))) {
      throw new NotFoundException('Problem not found');
    }
    if (dto.ownerId && !(await this.incidents.findMember(actor.organizationId, dto.ownerId))) {
      throw new BadRequestException('That person is not a member of this organization');
    }
  }
}
