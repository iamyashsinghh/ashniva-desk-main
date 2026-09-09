import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  MILESTONE_STATUS,
  type AuthenticatedUser,
  type MilestoneDetail,
  type MilestoneSummary,
  type PortalMilestoneSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type {
  CreateMilestoneDto,
  ListMilestonesQueryDto,
  UpdateMilestoneDto,
} from './dto/milestone.dto';
import { hasCycle } from './milestone-dependencies';
import { MilestoneProgressService } from './milestone-progress.service';
import { toMilestoneDetail, toMilestoneSummary, toPortalMilestone } from './milestones.mapper';
import { MilestonesRepository, type MilestoneDetailRow } from './milestones.repository';

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === null ? null : new Date(value);
}

/**
 * Project and contract milestones with deliverables, dependencies, automatic progress from
 * linked work, audited manual overrides and a completion history.
 */
@Injectable()
export class MilestonesService {
  constructor(
    private readonly milestones: MilestonesRepository,
    private readonly progress: MilestoneProgressService,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListMilestonesQueryDto): Promise<MilestoneSummary[]> {
    this.assertInternal(actor);
    const rows = await this.milestones.list({
      organizationId: actor.organizationId,
      projectId: query.projectId,
      contractId: query.contractId,
      clientOrganizationId: query.clientOrganizationId,
      status: query.status,
      ownerUserId: query.mine ? actor.userId : undefined,
    });
    const approvals = await this.milestones.latestApprovalStatusMap(rows.map((row) => row.id));
    return rows.map((row) => toMilestoneSummary(row, approvals.get(row.id) ?? null));
  }

  /** Summaries for one contract (used by the contract detail). */
  async summariesForContract(
    organizationId: string,
    contractId: string,
  ): Promise<MilestoneSummary[]> {
    const rows = await this.milestones.list({ organizationId, contractId });
    const approvals = await this.milestones.latestApprovalStatusMap(rows.map((row) => row.id));
    return rows.map((row) => toMilestoneSummary(row, approvals.get(row.id) ?? null));
  }

  async get(actor: AuthenticatedUser, id: string): Promise<MilestoneDetail> {
    this.assertInternal(actor);
    const row = await this.require(actor, id);
    const approvals = await this.milestones.latestApprovalStatusMap([row.id]);
    return toMilestoneDetail(row, approvals.get(row.id) ?? null);
  }

  async create(actor: AuthenticatedUser, dto: CreateMilestoneDto): Promise<MilestoneDetail> {
    this.assertInternal(actor);
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    await this.assertContract(actor, dto.contractId, project.clientOrganizationId);
    await this.assertOwner(actor, dto.ownerUserId);
    const row = await this.milestones.create({
      organizationId: actor.organizationId,
      projectId: project.id,
      contractId: dto.contractId ?? null,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      ownerUserId: dto.ownerUserId ?? null,
      startDate: toDate(dto.startDate) ?? null,
      dueDate: toDate(dto.dueDate) ?? null,
      clientVisible: dto.clientVisible ?? false,
      requiresApproval: dto.requiresApproval ?? false,
      sortOrder: dto.sortOrder ?? 0,
      createdById: actor.userId,
      history: {
        create: { kind: 'CREATED', toValue: MILESTONE_STATUS.PLANNED, changedById: actor.userId },
      },
    });
    if (dto.deliverables?.length) {
      await this.milestones.replaceDeliverables(row.id, dto.deliverables);
    }
    if (dto.dependsOnIds?.length) {
      await this.setDependencies(actor, row.id, project.id, dto.dependsOnIds);
    }
    await this.progress.recompute(row.id);
    await this.auditLog.record({
      action: AUDIT_ACTION.MILESTONE_CREATED,
      entityType: AUDIT_ENTITY_TYPE.MILESTONE,
      entityId: row.id,
      after: { name: row.name, projectId: project.id, contractId: dto.contractId ?? null },
    });
    return this.get(actor, row.id);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateMilestoneDto,
  ): Promise<MilestoneDetail> {
    this.assertInternal(actor);
    const before = await this.require(actor, id);
    if (dto.contractId !== undefined) {
      await this.assertContract(
        actor,
        dto.contractId ?? undefined,
        before.project.clientOrganizationId,
      );
    }
    await this.assertOwner(actor, dto.ownerUserId ?? undefined);
    const { deliverables, dependsOnIds, ...fields } = dto;
    const data: Prisma.MilestoneUncheckedUpdateInput = {
      ...(fields.contractId !== undefined ? { contractId: fields.contractId } : {}),
      ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
      ...(fields.description !== undefined
        ? { description: fields.description?.trim() || null }
        : {}),
      ...(fields.ownerUserId !== undefined ? { ownerUserId: fields.ownerUserId } : {}),
      ...(fields.startDate !== undefined ? { startDate: toDate(fields.startDate) } : {}),
      ...(fields.dueDate !== undefined ? { dueDate: toDate(fields.dueDate) } : {}),
      ...(fields.clientVisible !== undefined ? { clientVisible: fields.clientVisible } : {}),
      ...(fields.requiresApproval !== undefined
        ? { requiresApproval: fields.requiresApproval }
        : {}),
      ...(fields.sortOrder !== undefined ? { sortOrder: fields.sortOrder } : {}),
    };
    if (Object.keys(data).length > 0) {
      await this.milestones.update(id, data);
      await this.milestones.addHistory({
        milestoneId: id,
        kind: 'UPDATED',
        changedById: actor.userId,
      });
    }
    if (deliverables) {
      await this.milestones.replaceDeliverables(id, deliverables);
      await this.milestones.addHistory({
        milestoneId: id,
        kind: 'DELIVERABLE',
        changedById: actor.userId,
        toValue: `${deliverables.length} deliverables`,
      });
    }
    if (dependsOnIds) {
      await this.setDependencies(actor, id, before.projectId, dependsOnIds);
    }
    await this.progress.recompute(id);
    await this.auditLog.record({
      action: AUDIT_ACTION.MILESTONE_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.MILESTONE,
      entityId: id,
      before: { name: before.name, dueDate: before.dueDate, clientVisible: before.clientVisible },
      after: data,
    });
    return this.get(actor, id);
  }

  /** Client portal: client-visible milestones of the client's own projects. */
  async listForPortal(
    actor: AuthenticatedUser,
    providerId: string,
    projectId?: string,
  ): Promise<PortalMilestoneSummary[]> {
    const rows = await this.milestones.list({
      organizationId: providerId,
      clientOrganizationId: actor.organizationId,
      clientVisibleOnly: true,
      projectId,
    });
    const approvals = await this.milestones.latestApprovalStatusMap(rows.map((row) => row.id));
    return rows.map((row) => toPortalMilestone(row, approvals.get(row.id) ?? null));
  }

  // ---- helpers ------------------------------------------------------------------------------

  private async require(actor: AuthenticatedUser, id: string): Promise<MilestoneDetailRow> {
    const row = await this.milestones.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Milestone not found');
    }
    return row;
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Milestones are managed by the service provider');
    }
  }

  private async assertContract(
    actor: AuthenticatedUser,
    contractId: string | undefined,
    clientOrganizationId: string | null,
  ) {
    if (!contractId) {
      return;
    }
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }
    if (clientOrganizationId && contract.clientOrganizationId !== clientOrganizationId) {
      throw new BadRequestException('The contract belongs to a different client than the project');
    }
  }

  private async assertOwner(actor: AuthenticatedUser, ownerUserId: string | undefined) {
    if (!ownerUserId) {
      return;
    }
    const member = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: actor.organizationId, userId: ownerUserId, deletedAt: null },
    });
    if (!member) {
      throw new BadRequestException('The owner must be internal staff');
    }
  }

  private async setDependencies(
    actor: AuthenticatedUser,
    id: string,
    projectId: string,
    dependsOnIds: string[],
  ) {
    const unique = [...new Set(dependsOnIds)].filter((dependsOnId) => dependsOnId !== id);
    const targets = await this.prisma.milestone.count({
      where: {
        id: { in: unique },
        projectId,
        organizationId: actor.organizationId,
        deletedAt: null,
      },
    });
    if (targets !== unique.length) {
      throw new BadRequestException('Dependencies must be milestones of the same project');
    }
    const edges = (await this.milestones.edgesForProject(projectId)).filter(
      (edge) => edge.milestoneId !== id,
    );
    for (const dependsOnId of unique) {
      edges.push({ milestoneId: id, dependsOnId });
    }
    if (hasCycle(edges)) {
      throw new BadRequestException('These dependencies would form a cycle');
    }
    await this.milestones.replaceDependencies(id, unique);
  }
}
