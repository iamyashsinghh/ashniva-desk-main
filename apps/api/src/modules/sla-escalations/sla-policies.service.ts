import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type SlaPolicySummary,
  type SlaReapplyResult,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { parseClock } from './business-hours';
import type { CreateSlaPolicyDto, SlaRuleDto, UpdateSlaPolicyDto } from './dto/sla-policy.dto';
import { toSlaPolicySummary } from './sla-policies.mapper';
import { SlaPoliciesRepository, type SlaPolicyRow } from './sla-policies.repository';
import { TicketSlaService } from './ticket-sla.service';

/** SLA policies: default, per client, per project. Every change re-applies to open tickets. */
@Injectable()
export class SlaPoliciesService {
  constructor(
    private readonly policies: SlaPoliciesRepository,
    private readonly ticketSla: TicketSlaService,
    private readonly organizations: OrganizationsRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(actor: AuthenticatedUser): Promise<SlaPolicySummary[]> {
    this.assertInternal(actor);
    const rows = await this.policies.list(actor.organizationId);
    return rows.map(toSlaPolicySummary);
  }

  async get(actor: AuthenticatedUser, id: string): Promise<SlaPolicySummary> {
    this.assertInternal(actor);
    return toSlaPolicySummary(await this.require(actor, id));
  }

  async create(actor: AuthenticatedUser, dto: CreateSlaPolicyDto): Promise<SlaPolicySummary> {
    this.assertInternal(actor);
    await this.assertScope(actor, dto.clientOrganizationId ?? null, dto.projectId ?? null);
    this.assertHours(dto.businessHoursStart ?? '09:00', dto.businessHoursEnd ?? '18:00');
    this.assertRules(dto.rules);
    const row = await this.policies.create(
      {
        organizationId: actor.organizationId,
        clientOrganizationId: dto.clientOrganizationId ?? null,
        projectId: dto.projectId ?? null,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isDefault: dto.isDefault ?? false,
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
        ...(dto.businessHoursStart ? { businessHoursStart: dto.businessHoursStart } : {}),
        ...(dto.businessHoursEnd ? { businessHoursEnd: dto.businessHoursEnd } : {}),
        ...(dto.businessDays ? { businessDays: [...dto.businessDays].sort() } : {}),
        ...(dto.pauseStatuses ? { pauseStatuses: dto.pauseStatuses } : {}),
        ...(dto.warningPercent !== undefined ? { warningPercent: dto.warningPercent } : {}),
      },
      dto.rules,
    );
    await this.auditLog.record({
      action: AUDIT_ACTION.SLA_POLICY_CREATED,
      entityType: AUDIT_ENTITY_TYPE.SLA_POLICY,
      entityId: row.id,
      after: this.snapshot(row),
    });
    const reapplied = await this.ticketSla.reapply(actor.organizationId);
    return {
      ...toSlaPolicySummary(await this.refresh(actor, row.id, reapplied)),
      reapply: reapplied,
    };
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateSlaPolicyDto,
  ): Promise<SlaPolicySummary> {
    this.assertInternal(actor);
    const before = await this.require(actor, id);
    const clientOrganizationId =
      dto.clientOrganizationId === undefined
        ? before.clientOrganizationId
        : dto.clientOrganizationId;
    const projectId = dto.projectId === undefined ? before.projectId : dto.projectId;
    await this.assertScope(actor, clientOrganizationId, projectId, id);
    this.assertHours(
      dto.businessHoursStart ?? before.businessHoursStart,
      dto.businessHoursEnd ?? before.businessHoursEnd,
    );
    if (dto.rules) {
      this.assertRules(dto.rules);
    }
    const data: Prisma.SlaPolicyUncheckedUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.clientOrganizationId !== undefined ? { clientOrganizationId } : {}),
      ...(dto.projectId !== undefined ? { projectId } : {}),
      ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.businessHoursStart !== undefined
        ? { businessHoursStart: dto.businessHoursStart }
        : {}),
      ...(dto.businessHoursEnd !== undefined ? { businessHoursEnd: dto.businessHoursEnd } : {}),
      ...(dto.businessDays !== undefined ? { businessDays: [...dto.businessDays].sort() } : {}),
      ...(dto.pauseStatuses !== undefined ? { pauseStatuses: dto.pauseStatuses } : {}),
      ...(dto.warningPercent !== undefined ? { warningPercent: dto.warningPercent } : {}),
    };
    const row = await this.policies.update(actor.organizationId, id, data, dto.rules);
    await this.auditLog.record({
      action: AUDIT_ACTION.SLA_POLICY_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.SLA_POLICY,
      entityId: id,
      before: this.snapshot(before),
      after: this.snapshot(row),
    });
    const reapplied = await this.ticketSla.reapply(actor.organizationId);
    return { ...toSlaPolicySummary(await this.refresh(actor, id, reapplied)), reapply: reapplied };
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    this.assertInternal(actor);
    const before = await this.require(actor, id);
    await this.policies.softDelete(id);
    await this.auditLog.record({
      action: AUDIT_ACTION.SLA_POLICY_DELETED,
      entityType: AUDIT_ENTITY_TYPE.SLA_POLICY,
      entityId: id,
      before: this.snapshot(before),
    });
    await this.ticketSla.reapply(actor.organizationId);
  }

  // ---- helpers ------------------------------------------------------------------------------

  /**
   * Re-reads the policy and records what saving it did to the open tickets.
   *
   * `truncated` is in the audit payload, not only in the count: `reappliedToOpenTickets: 5000`
   * reads as a complete run whether or not there were another thousand tickets behind it, and an
   * audit record that cannot be told apart from a complete one is worse than no record.
   */
  private async refresh(
    actor: AuthenticatedUser,
    id: string,
    reapplied: SlaReapplyResult,
  ): Promise<SlaPolicyRow> {
    const row = await this.require(actor, id);
    if (reapplied.changed > 0 || reapplied.truncated) {
      await this.auditLog.record({
        action: AUDIT_ACTION.SLA_POLICY_UPDATED,
        entityType: AUDIT_ENTITY_TYPE.SLA_POLICY,
        entityId: id,
        after: {
          reappliedToOpenTickets: reapplied.changed,
          reapplyTruncated: reapplied.truncated,
        },
      });
    }
    return row;
  }

  private async require(actor: AuthenticatedUser, id: string): Promise<SlaPolicyRow> {
    const row = await this.policies.findById(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('SLA policy not found');
    }
    return row;
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('SLA policies are managed by the service provider');
    }
  }

  private assertHours(start: string, end: string): void {
    if (parseClock(start) >= parseClock(end)) {
      throw new BadRequestException('Business hours must end after they start');
    }
  }

  private assertRules(rules: SlaRuleDto[]): void {
    const priorities = new Set(rules.map((rule) => rule.priority));
    if (priorities.size !== rules.length) {
      throw new BadRequestException('One rule per priority');
    }
    if (rules.some((rule) => rule.firstResponseMinutes > rule.resolutionMinutes)) {
      throw new BadRequestException('First response cannot be due after resolution');
    }
  }

  /** A policy is scoped to a project, or a client, or is the default; never two at once. */
  private async assertScope(
    actor: AuthenticatedUser,
    clientOrganizationId: string | null,
    projectId: string | null,
    excludeId?: string,
  ): Promise<void> {
    if (clientOrganizationId && projectId) {
      throw new BadRequestException('Scope a policy to a client or to a project, not both');
    }
    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, organizationId: actor.organizationId, deletedAt: null },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
    }
    if (clientOrganizationId) {
      const client = await this.organizations.findById(clientOrganizationId);
      if (!client || client.isServiceProvider || client.deletedAt) {
        throw new BadRequestException('Choose a client organization');
      }
    }
    const scope = projectId ? { projectId } : { clientOrganizationId, projectId: null };
    if (!projectId && !clientOrganizationId) {
      return;
    }
    const duplicate = await this.prisma.slaPolicy.findFirst({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        ...scope,
      },
    });
    if (duplicate) {
      throw new BadRequestException(`"${duplicate.name}" already covers that scope`);
    }
  }

  private snapshot(row: SlaPolicyRow): Record<string, unknown> {
    return {
      name: row.name,
      isDefault: row.isDefault,
      clientOrganizationId: row.clientOrganizationId,
      projectId: row.projectId,
      timezone: row.timezone,
      hours: `${row.businessHoursStart}-${row.businessHoursEnd}`,
      businessDays: row.businessDays,
      pauseStatuses: row.pauseStatuses,
      warningPercent: row.warningPercent,
      rules: row.rules.map(
        (rule) => `${rule.priority}:${rule.firstResponseMinutes}/${rule.resolutionMinutes}`,
      ),
    };
  }
}
