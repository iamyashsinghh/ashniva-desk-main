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
  RELEASE_ITEM_KIND,
  type AuthenticatedUser,
  type PaginatedResponse,
  type ReleaseDetail,
  type ReleaseStatus,
  type ReleaseSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import type { Prisma } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { ReleaseReadinessService } from './release-readiness.service';
import { isReleaseEditable, mayChangeItems, mayChangeVersion } from './release-workflow';
import { toReleaseDetail, toReleaseSummary } from './releases.mapper';
import { ReleasesRepository, type ReleaseDetailRow } from './releases.repository';
import type {
  AddReleaseItemDto,
  CreateReleaseDto,
  ListReleasesQueryDto,
  UpdateReleaseDto,
} from './dto/release.dto';

/**
 * Reads, creation, edits and contents of a release. Status moves live in
 * `ReleaseTransitionsService`, which is where the concurrency and the gates are.
 *
 * Releases are internal throughout: they name staging URLs, failed deployments and other clients'
 * work, so there is no portal counterpart to this service. What a client sees of a release is the
 * release note and the UAT request, both of which are built elsewhere by allow-list mappers.
 */
@Injectable()
export class ReleasesService {
  constructor(
    private readonly releases: ReleasesRepository,
    private readonly readiness: ReleaseReadinessService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListReleasesQueryDto,
  ): Promise<PaginatedResponse<ReleaseSummary>> {
    this.assertInternal(actor);
    const page = await this.releases.list({
      organizationId: actor.organizationId,
      projectId: query.projectId,
      status: query.status as ReleaseStatus[] | undefined,
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    });
    return {
      items: page.items.map(toReleaseSummary),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<ReleaseDetail> {
    return this.detail(actor, await this.require(actor, id));
  }

  async create(actor: AuthenticatedUser, dto: CreateReleaseDto): Promise<ReleaseDetail> {
    this.assertInternal(actor);
    const project = await this.releases.findProject(actor.organizationId, dto.projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const version = dto.version.trim();
    if (await this.releases.findByVersion(actor.organizationId, dto.projectId, version)) {
      throw new ConflictException(`Version ${version} already exists on this project`);
    }
    const row = await this.releases.create(actor.organizationId, {
      projectId: dto.projectId,
      version,
      title: dto.title.trim(),
      notes: dto.notes?.trim() || null,
      ...(dto.environment ? { environment: dto.environment } : {}),
      createdById: actor.userId,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.RELEASE_CREATED,
      entityType: AUDIT_ENTITY_TYPE.RELEASE,
      entityId: row.id,
      organizationId: actor.organizationId,
      after: { version: row.version, title: row.title, projectId: row.projectId },
    });
    return this.detail(actor, row);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateReleaseDto,
  ): Promise<ReleaseDetail> {
    const before = await this.require(actor, id);
    const status = before.status as ReleaseStatus;
    if (!isReleaseEditable(status)) {
      throw new ConflictException(`A release that is ${status} can no longer be edited`);
    }
    const data: Prisma.ReleaseUncheckedUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      ...(dto.environment !== undefined ? { environment: dto.environment } : {}),
    };
    if (dto.version !== undefined) {
      const version = dto.version.trim();
      if (!mayChangeVersion(status)) {
        throw new ConflictException(
          'The version is fixed once approval has been requested — reject the release back to draft to change it',
        );
      }
      if (
        version !== before.version &&
        (await this.releases.findByVersion(actor.organizationId, before.projectId, version))
      ) {
        throw new ConflictException(`Version ${version} already exists on this project`);
      }
      data.version = version;
    }
    await this.releases.update(actor.organizationId, id, data);
    // Audited even though it changes no status. The version and the contents of a release are
    // what an approver signed off on, so "who changed it, and to what" has to survive the edit.
    await this.auditLog.record({
      action: AUDIT_ACTION.RELEASE_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.RELEASE,
      entityId: id,
      organizationId: actor.organizationId,
      before: { version: before.version, title: before.title },
      after: { version: data.version ?? before.version, title: data.title ?? before.title },
    });
    return this.get(actor, id);
  }

  /**
   * Adds one task, ticket or change request to a release.
   *
   * Only in DRAFT: see `mayChangeItems`. The target is looked up scoped to the provider *and* to
   * the release's own project, so a release cannot be made to carry another client's work.
   */
  async addItem(
    actor: AuthenticatedUser,
    id: string,
    dto: AddReleaseItemDto,
  ): Promise<ReleaseDetail> {
    const release = await this.require(actor, id);
    this.assertItemsChangeable(release);
    const ids = itemIdsFor(dto);
    const target = await this.releases.findItemTarget(actor.organizationId, release.projectId, ids);
    if (!target) {
      throw new NotFoundException('That item was not found on this project');
    }
    // The unique indexes on (releaseId, taskId | ticketId | changeRequestId) already stop a
    // duplicate; checking first turns a generic conflict into something an operator can act on.
    const already = release.items.some(
      (item) =>
        (ids.taskId && item.taskId === ids.taskId) ||
        (ids.ticketId && item.ticketId === ids.ticketId) ||
        (ids.changeRequestId && item.changeRequestId === ids.changeRequestId),
    );
    if (already) {
      throw new ConflictException('That item is already in this release');
    }
    await this.releases.addItem(release.id, { kind: dto.kind, ...ids });
    return this.get(actor, id);
  }

  async removeItem(actor: AuthenticatedUser, id: string, itemId: string): Promise<ReleaseDetail> {
    const release = await this.require(actor, id);
    this.assertItemsChangeable(release);
    if ((await this.releases.removeItem(release.id, itemId)) === 0) {
      throw new NotFoundException('Item not found in this release');
    }
    return this.get(actor, id);
  }

  // ---- shared helpers -----------------------------------------------------------------------

  /** Loads a release inside the caller's tenant, or reports it as missing. */
  async require(actor: AuthenticatedUser, id: string): Promise<ReleaseDetailRow> {
    this.assertInternal(actor);
    const row = await this.releases.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Release not found');
    }
    return row;
  }

  /** The readiness checklist is part of every detail response, computed for this actor. */
  async detail(actor: AuthenticatedUser, row: ReleaseDetailRow): Promise<ReleaseDetail> {
    return toReleaseDetail(row, await this.readiness.forRelease(row, actor));
  }

  private assertItemsChangeable(release: ReleaseDetailRow): void {
    if (!mayChangeItems(release.status as ReleaseStatus)) {
      throw new ConflictException(
        `The contents of a release that is ${release.status} cannot change — what was approved has to be what ships`,
      );
    }
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Releases are internal');
    }
  }
}

/** Exactly one id, and it has to be the one `kind` names. */
function itemIdsFor(dto: AddReleaseItemDto): {
  taskId?: string;
  ticketId?: string;
  changeRequestId?: string;
} {
  const given = [dto.taskId, dto.ticketId, dto.changeRequestId].filter(Boolean);
  if (given.length !== 1) {
    throw new BadRequestException('Give exactly one of taskId, ticketId or changeRequestId');
  }
  if (dto.kind === RELEASE_ITEM_KIND.TASK && dto.taskId) {
    return { taskId: dto.taskId };
  }
  if (dto.kind === RELEASE_ITEM_KIND.TICKET && dto.ticketId) {
    return { ticketId: dto.ticketId };
  }
  if (dto.kind === RELEASE_ITEM_KIND.CHANGE_REQUEST && dto.changeRequestId) {
    return { changeRequestId: dto.changeRequestId };
  }
  throw new BadRequestException(`A ${dto.kind} item must carry the matching id`);
}
