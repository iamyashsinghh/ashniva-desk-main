import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  APPROVAL_ACTION,
  APPROVAL_LIST_VIEW,
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CLIENT_VISIBLE_APPROVAL_STATUSES,
  type ApprovalDetail,
  type ApprovalSummary,
  type AuthenticatedUser,
  type PaginatedResponse,
  type PortalApprovalDetail,
  type PortalApprovalSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import type { ApprovalStatus, Prisma } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { ApprovalSubjectsService } from './approval-subjects.service';
import {
  assertApprovalAction,
  explainApprovalAction,
  listApprovalActions,
} from './approval-workflow';
import {
  toApprovalDetail,
  toApprovalSummary,
  toPortalApprovalDetail,
  toPortalApprovalSummary,
} from './approvals.mapper';
import { ApprovalsRepository, type ApprovalDetailRow } from './approvals.repository';
import type {
  CreateApprovalDto,
  ListApprovalsQueryDto,
  UpdateApprovalDto,
} from './dto/approval.dto';

const VIEW_STATUSES: Record<string, ApprovalStatus[] | undefined> = {
  [APPROVAL_LIST_VIEW.INBOX]: ['INTERNAL_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'],
  [APPROVAL_LIST_VIEW.WAITING_CLIENT]: ['PUBLISHED'],
  [APPROVAL_LIST_VIEW.DECIDED]: ['CLIENT_APPROVED', 'REJECTED', 'CHANGES_REQUESTED'],
};

/** Reads, creation and edits of approval requests; status moves live in ApprovalTransitionsService. */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly approvals: ApprovalsRepository,
    private readonly subjects: ApprovalSubjectsService,
    private readonly organizations: OrganizationsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListApprovalsQueryDto,
  ): Promise<PaginatedResponse<ApprovalSummary>> {
    this.assertInternal(actor);
    const view = query.view ?? APPROVAL_LIST_VIEW.INBOX;
    const page = await this.approvals.list({
      organizationId: actor.organizationId,
      clientOrganizationId: query.clientOrganizationId,
      status: query.status ?? VIEW_STATUSES[view],
      requestedById: view === APPROVAL_LIST_VIEW.MINE ? actor.userId : undefined,
      subjectType: query.subjectType,
      projectId: query.projectId,
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    });
    const labels = await this.subjects.labelsFor(page.items);
    return {
      items: page.items.map((row) =>
        toApprovalSummary(row, labels.get(row.subjectId) ?? row.title),
      ),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<ApprovalDetail> {
    this.assertInternal(actor);
    return this.detail(actor, await this.require(actor, id));
  }

  async create(actor: AuthenticatedUser, dto: CreateApprovalDto): Promise<ApprovalDetail> {
    this.assertInternal(actor);
    const subject = await this.subjects.resolve(
      actor.organizationId,
      dto.subjectType,
      dto.subjectId,
    );
    const row = await this.approvals.create(
      {
        organizationId: actor.organizationId,
        clientOrganizationId: subject.clientOrganizationId,
        projectId: subject.projectId,
        contractId: subject.contractId,
        changeRequestId: subject.changeRequestId,
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        title: dto.title.trim(),
        summary: dto.summary.trim(),
        internalNotes: dto.internalNotes?.trim() || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        requestedById: actor.userId,
      },
      dto.fileIds ?? [],
    );
    await this.auditLog.record({
      action: AUDIT_ACTION.APPROVAL_CREATED,
      entityType: AUDIT_ENTITY_TYPE.APPROVAL,
      entityId: row.id,
      after: { title: row.title, subject: `${row.subjectType}:${row.subjectId}` },
    });
    return this.detail(actor, row);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateApprovalDto,
  ): Promise<ApprovalDetail> {
    this.assertInternal(actor);
    const before = await this.require(actor, id);
    assertApprovalAction(before, actor, APPROVAL_ACTION.EDIT);
    const data: Prisma.ApprovalRequestUncheckedUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.summary !== undefined ? { summary: dto.summary.trim() } : {}),
      ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
      ...(dto.internalNotes !== undefined
        ? { internalNotes: dto.internalNotes?.trim() || null }
        : {}),
    };
    const row = await this.approvals.update(id, data);
    await this.auditLog.record({
      action: AUDIT_ACTION.APPROVAL_STATUS_CHANGED,
      entityType: AUDIT_ENTITY_TYPE.APPROVAL,
      entityId: id,
      before: { title: before.title },
      after: { title: row.title, changed: Object.keys(data) },
    });
    return this.detail(actor, row);
  }

  // ---- portal -------------------------------------------------------------------------------

  async portalList(actor: AuthenticatedUser): Promise<PortalApprovalSummary[]> {
    this.assertClient(actor);
    const page = await this.approvals.list({
      organizationId: await this.providerId(),
      clientOrganizationId: actor.organizationId,
      status: [...CLIENT_VISIBLE_APPROVAL_STATUSES],
      limit: 100,
    });
    const labels = await this.subjects.labelsFor(page.items);
    return page.items.map((row) =>
      toPortalApprovalSummary(row, labels.get(row.subjectId) ?? row.title),
    );
  }

  async portalGet(actor: AuthenticatedUser, id: string): Promise<PortalApprovalDetail> {
    this.assertClient(actor);
    const row = await this.requireForClient(actor, id);
    const labels = await this.subjects.labelsFor([row]);
    const canDecide = explainApprovalAction(row, actor, APPROVAL_ACTION.APPROVE).enabled;
    return toPortalApprovalDetail(row, labels.get(row.subjectId) ?? row.title, canDecide);
  }

  // ---- shared helpers -----------------------------------------------------------------------

  async detail(actor: AuthenticatedUser, row: ApprovalDetailRow): Promise<ApprovalDetail> {
    const labels = await this.subjects.labelsFor([row]);
    return toApprovalDetail(
      row,
      labels.get(row.subjectId) ?? row.title,
      listApprovalActions(row, actor),
    );
  }

  /** Internal staff: any request of the provider. Clients: only published ones of their organization. */
  async require(actor: AuthenticatedUser, id: string): Promise<ApprovalDetailRow> {
    if (!isInternalUser(actor)) {
      return this.requireForClient(actor, id);
    }
    const row = await this.approvals.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Approval request not found');
    }
    return row;
  }

  private async requireForClient(actor: AuthenticatedUser, id: string): Promise<ApprovalDetailRow> {
    const row = await this.approvals.findDetail(await this.providerId(), id, actor.organizationId);
    if (!row || !(CLIENT_VISIBLE_APPROVAL_STATUSES as string[]).includes(row.status)) {
      throw new NotFoundException('Approval request not found');
    }
    return row;
  }

  private async providerId(): Promise<string> {
    const provider = await this.organizations.findServiceProvider();
    if (!provider) {
      throw new NotFoundException('Service provider organization is not configured');
    }
    return provider.id;
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Approval requests are prepared by the service provider');
    }
  }

  private assertClient(actor: AuthenticatedUser): void {
    if (isInternalUser(actor)) {
      throw new ForbiddenException('The portal is for client organizations');
    }
  }
}
