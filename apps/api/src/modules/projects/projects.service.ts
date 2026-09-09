import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type ProjectDetail,
  type ProjectSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import type {
  CreateProjectDto,
  ListProjectsQueryDto,
  SetProjectMembersDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { toProjectDetail, toProjectSummary } from './projects.mapper';
import { ProjectsRepository, type ProjectRow } from './projects.repository';

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === null ? null : new Date(value);
}

/**
 * Internal projects API. Client users never reach these routes (they use /portal/*), so the
 * tenant scope is always the caller's — the service-provider — organization.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListProjectsQueryDto): Promise<ProjectSummary[]> {
    this.assertInternal(actor);
    const rows = await this.projects.list({
      organizationId: actor.organizationId,
      status: query.status,
      clientOrganizationId: query.clientOrganizationId,
      search: query.search,
      memberUserId: query.mine ? actor.userId : undefined,
    });
    const counts = await this.projects.countsByProject(
      actor.organizationId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => toProjectSummary(row, counts.get(row.id)));
  }

  async get(actor: AuthenticatedUser, id: string): Promise<ProjectDetail> {
    this.assertInternal(actor);
    const row = await this.require(actor, id);
    const counts = await this.projects.countsByProject(actor.organizationId, [row.id]);
    return toProjectDetail(row, counts.get(row.id));
  }

  async create(actor: AuthenticatedUser, dto: CreateProjectDto): Promise<ProjectDetail> {
    this.assertInternal(actor);
    if (await this.projects.findByCode(actor.organizationId, dto.code)) {
      throw new ConflictException(`Project code ${dto.code} is already in use`);
    }
    await this.assertClientOrganization(actor, dto.clientOrganizationId);
    const { members, startDate, targetDate, ...rest } = dto;
    const row = await this.projects.create(actor.organizationId, actor.userId, {
      ...rest,
      startDate: toDate(startDate),
      targetDate: toDate(targetDate),
    });
    const initialMembers = members ?? [];
    for (const [userId, role] of [
      [dto.managerUserId, 'MANAGER'],
      [dto.leadUserId, 'LEAD'],
    ] as const) {
      if (userId && !initialMembers.some((member) => member.userId === userId)) {
        initialMembers.push({ userId, role });
      }
    }
    await this.projects.setMembers(actor.organizationId, row.id, initialMembers);
    await this.auditLog.record({
      action: AUDIT_ACTION.PROJECT_CREATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: row.id,
      after: {
        code: row.code,
        name: row.name,
        type: row.type,
        clientOrganizationId: row.clientOrganizationId,
      },
    });
    return this.get(actor, row.id);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectDetail> {
    this.assertInternal(actor);
    const before = await this.require(actor, id);
    await this.assertClientOrganization(actor, dto.clientOrganizationId);
    const { startDate, targetDate, ...rest } = dto;
    const row = await this.projects.update(id, {
      ...rest,
      startDate: toDate(startDate),
      targetDate: toDate(targetDate),
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.PROJECT_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: id,
      before: { name: before.name, status: before.status, type: before.type },
      after: { name: row.name, status: row.status, type: row.type },
    });
    return this.get(actor, id);
  }

  async setMembers(
    actor: AuthenticatedUser,
    id: string,
    dto: SetProjectMembersDto,
  ): Promise<ProjectDetail> {
    this.assertInternal(actor);
    await this.require(actor, id);
    await this.projects.setMembers(actor.organizationId, id, dto.members);
    await this.auditLog.record({
      action: AUDIT_ACTION.PROJECT_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: id,
      after: { members: dto.members },
    });
    return this.get(actor, id);
  }

  private async require(actor: AuthenticatedUser, id: string): Promise<ProjectRow> {
    const row = await this.projects.findById(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Project not found');
    }
    return row;
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Clients use the portal to see their projects');
    }
  }

  private async assertClientOrganization(
    actor: AuthenticatedUser,
    clientOrganizationId?: string | null,
  ): Promise<void> {
    if (!clientOrganizationId) {
      return;
    }
    const organization = await this.organizations.findById(clientOrganizationId);
    if (!organization || organization.id === actor.organizationId) {
      throw new NotFoundException('Client organization not found');
    }
  }
}
