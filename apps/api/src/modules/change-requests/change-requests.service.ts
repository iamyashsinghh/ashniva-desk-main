import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CHANGE_REQUEST_ACTION,
  CHANGE_REQUEST_STATUS,
  CLIENT_VISIBLE_CHANGE_REQUEST_STATUSES,
  PERMISSIONS,
  VISIBILITY,
  type AuthenticatedUser,
  type ChangeRequestDetail,
  type ChangeRequestSummary,
  type CommentSummary,
  type PaginatedResponse,
  type PortalChangeRequestDetail,
  type PortalChangeRequestSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import type { Prisma } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { CommentsRepository } from '../tasks/comments.repository';
import { toComment } from '../tasks/tasks.mapper';
import { ChangeRequestScopeService } from './change-request-scope.service';
import {
  assertChangeRequestAction,
  explainChangeRequestAction,
  listChangeRequestActions,
} from './change-request-workflow';
import {
  changeRequestNumber,
  toChangeRequestDetail,
  toChangeRequestSummary,
  toPortalChangeRequestDetail,
  toPortalChangeRequestSummary,
} from './change-requests.mapper';
import {
  ChangeRequestsRepository,
  type ChangeRequestDetailRow,
} from './change-requests.repository';
import type {
  ChangeRequestCommentDto,
  CreateChangeRequestDto,
  ListChangeRequestsQueryDto,
  UpdateChangeRequestDto,
} from './dto/change-request.dto';

const STAFF_FIELDS = [
  'estimatedMinutes',
  'costImpact',
  'currency',
  'timelineImpactDays',
  'internalNotes',
] as const;

/** Reads, creation, edits and comments. Status moves live in ChangeRequestTransitionsService. */
@Injectable()
export class ChangeRequestsService {
  constructor(
    private readonly changeRequests: ChangeRequestsRepository,
    private readonly comments: CommentsRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly scope: ChangeRequestScopeService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Shared by both audiences: `internalOnly` keeps clients on their own portal route. */
  async list(
    actor: AuthenticatedUser,
    query: ListChangeRequestsQueryDto,
    options: { internalOnly?: boolean } = {},
  ): Promise<PaginatedResponse<ChangeRequestSummary | PortalChangeRequestSummary>> {
    if (options.internalOnly) {
      this.assertInternal(actor);
    }
    const internal = isInternalUser(actor);
    const page = await this.changeRequests.list({
      organizationId: await this.providerId(actor),
      clientOrganizationId: internal ? query.clientOrganizationId : actor.organizationId,
      requestedById: query.mine ? actor.userId : undefined,
      hideDraftsExcept: internal ? undefined : actor.userId,
      status: query.status,
      projectId: query.projectId,
      contractId: query.contractId,
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    });
    return {
      items: page.items.map(internal ? toChangeRequestSummary : toPortalChangeRequestSummary),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<ChangeRequestDetail> {
    this.assertInternal(actor);
    return this.detail(actor, await this.require(actor, id));
  }

  async portalGet(actor: AuthenticatedUser, id: string): Promise<PortalChangeRequestDetail> {
    this.assertClient(actor);
    return this.portalDetail(actor, await this.require(actor, id));
  }

  /** Clients raise for their own company; staff may raise on a client's behalf. */
  async create(actor: AuthenticatedUser, dto: CreateChangeRequestDto) {
    const internal = isInternalUser(actor);
    const organizationId = await this.providerId(actor);
    let clientOrganizationId = actor.organizationId;
    let requestedById = actor.userId;
    if (internal) {
      if (!dto.clientOrganizationId) {
        throw new BadRequestException('Choose the client organization the change is for');
      }
      clientOrganizationId = dto.clientOrganizationId;
      await this.scope.assertClientOrganization(clientOrganizationId);
      if (dto.requestedById) {
        await this.scope.assertMember(clientOrganizationId, dto.requestedById);
        requestedById = dto.requestedById;
      }
    } else if (dto.clientOrganizationId && dto.clientOrganizationId !== actor.organizationId) {
      throw new ForbiddenException('You can only raise change requests for your own organization');
    }
    await this.scope.assertProject(organizationId, dto.projectId, clientOrganizationId);
    await this.scope.assertContract(organizationId, dto.contractId, clientOrganizationId);
    const row = await this.changeRequests.create(
      organizationId,
      {
        clientOrganizationId,
        projectId: dto.projectId ?? null,
        contractId: dto.contractId ?? null,
        title: dto.title.trim(),
        description: dto.description.trim(),
        businessReason: dto.businessReason?.trim() || null,
        scope: dto.scope?.trim() || null,
        impact: dto.impact?.trim() || null,
        requestedById,
        createdById: actor.userId,
      },
      dto.fileIds ?? [],
    );
    await this.auditLog.record({
      action: AUDIT_ACTION.CHANGE_REQUEST_CREATED,
      entityType: AUDIT_ENTITY_TYPE.CHANGE_REQUEST,
      entityId: row.id,
      organizationId,
      after: { number: changeRequestNumber(row), title: row.title, clientOrganizationId },
    });
    return internal ? this.detail(actor, row) : this.portalDetail(actor, row);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateChangeRequestDto) {
    const before = await this.require(actor, id);
    assertChangeRequestAction(before, actor, CHANGE_REQUEST_ACTION.EDIT);
    const internal = isInternalUser(actor);
    if (!internal && STAFF_FIELDS.some((field) => dto[field] !== undefined)) {
      throw new ForbiddenException(
        'Estimates, cost impact and internal notes are set by the provider',
      );
    }
    if (dto.projectId !== undefined) {
      await this.scope.assertProject(
        before.organizationId,
        dto.projectId ?? undefined,
        before.clientOrganizationId,
      );
    }
    if (dto.contractId !== undefined) {
      await this.scope.assertContract(
        before.organizationId,
        dto.contractId ?? undefined,
        before.clientOrganizationId,
      );
    }
    const text = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() || null;
    const data: Prisma.ChangeRequestUncheckedUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
      ...(dto.businessReason !== undefined ? { businessReason: text(dto.businessReason) } : {}),
      ...(dto.scope !== undefined ? { scope: text(dto.scope) } : {}),
      ...(dto.impact !== undefined ? { impact: text(dto.impact) } : {}),
      ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
      ...(dto.contractId !== undefined ? { contractId: dto.contractId } : {}),
      ...(dto.estimatedMinutes !== undefined ? { estimatedMinutes: dto.estimatedMinutes } : {}),
      ...(dto.costImpact !== undefined ? { costImpact: dto.costImpact } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency.toUpperCase() } : {}),
      ...(dto.timelineImpactDays !== undefined
        ? { timelineImpactDays: dto.timelineImpactDays }
        : {}),
      ...(dto.internalNotes !== undefined ? { internalNotes: text(dto.internalNotes) } : {}),
    };
    const row = await this.changeRequests.update(id, data);
    await this.auditLog.record({
      action: AUDIT_ACTION.CHANGE_REQUEST_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.CHANGE_REQUEST,
      entityId: id,
      organizationId: row.organizationId,
      before: { title: before.title, status: before.status },
      after: { title: row.title, changed: Object.keys(data) },
    });
    return internal ? this.detail(actor, row) : this.portalDetail(actor, row);
  }

  async addComment(
    actor: AuthenticatedUser,
    id: string,
    dto: ChangeRequestCommentDto,
  ): Promise<CommentSummary> {
    const cr = await this.require(actor, id);
    if (cr.status === CHANGE_REQUEST_STATUS.CANCELLED) {
      throw new ForbiddenException('Cancelled requests are read-only');
    }
    const internal = isInternalUser(actor);
    const visibility = internal ? (dto.visibility ?? VISIBILITY.CLIENT) : VISIBILITY.CLIENT;
    if (
      visibility === VISIBILITY.INTERNAL &&
      !actor.permissions.includes(PERMISSIONS.COMMENT_INTERNAL)
    ) {
      throw new ForbiddenException('Your role cannot write internal notes');
    }
    const row = await this.comments.create({
      organizationId: cr.organizationId,
      changeRequestId: id,
      authorId: actor.userId,
      body: dto.body,
      visibility,
    });
    return toComment(row);
  }

  // ---- shared helpers -----------------------------------------------------------------------

  detail(actor: AuthenticatedUser, row: ChangeRequestDetailRow): ChangeRequestDetail {
    return toChangeRequestDetail(row, listChangeRequestActions(row, actor), {
      includeInternalComments: actor.permissions.includes(PERMISSIONS.COMMENT_INTERNAL),
    });
  }

  portalDetail(actor: AuthenticatedUser, row: ChangeRequestDetailRow): PortalChangeRequestDetail {
    const can = (action: Parameters<typeof explainChangeRequestAction>[2]) =>
      explainChangeRequestAction(row, actor, action).enabled;
    return toPortalChangeRequestDetail(row, {
      approve: can(CHANGE_REQUEST_ACTION.APPROVE),
      requestChanges: can(CHANGE_REQUEST_ACTION.REQUEST_CHANGES),
      reply: row.status !== CHANGE_REQUEST_STATUS.CANCELLED,
    });
  }

  /** Staff: any request of the provider. Clients: their organization's, and only their own drafts. */
  async require(actor: AuthenticatedUser, id: string): Promise<ChangeRequestDetailRow> {
    const internal = isInternalUser(actor);
    const row = await this.changeRequests.findDetail(
      await this.providerId(actor),
      id,
      internal ? undefined : actor.organizationId,
    );
    const hiddenDraft =
      row &&
      !internal &&
      row.status === CHANGE_REQUEST_STATUS.DRAFT &&
      row.requestedById !== actor.userId;
    if (!row || hiddenDraft) {
      throw new NotFoundException('Change request not found');
    }
    if (!internal && !(CLIENT_VISIBLE_CHANGE_REQUEST_STATUSES as string[]).includes(row.status)) {
      if (row.status !== CHANGE_REQUEST_STATUS.DRAFT) {
        throw new NotFoundException('Change request not found');
      }
    }
    return row;
  }

  async providerId(actor: AuthenticatedUser): Promise<string> {
    if (isInternalUser(actor)) {
      return actor.organizationId;
    }
    const provider = await this.organizations.findServiceProvider();
    if (!provider) {
      throw new NotFoundException('Service provider organization is not configured');
    }
    return provider.id;
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Use the client portal');
    }
  }

  private assertClient(actor: AuthenticatedUser): void {
    if (isInternalUser(actor)) {
      throw new ForbiddenException('The portal is for client organizations');
    }
  }
}
