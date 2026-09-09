import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ALL_REPORT_TYPES,
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CLIENT_REPORT_TYPES,
  PERMISSIONS,
  REPORT_TYPE,
  REPORT_TYPE_LABELS,
  type AuthenticatedUser,
  type ReportFilters,
  type ReportResult,
  type ReportType,
} from '@ashniva/types';

import { isInternalUser } from '../../../common/auth/access-scope';
import { PrismaService } from '../../../database/prisma.service';
import { AuditLogService } from '../../audit-logs/audit-log.service';
import { OrganizationsRepository } from '../../organizations/organizations.repository';
import { WorkLogsService } from '../../work-logs/work-logs.service';
import { contractStatus, supportHours } from './contract-reports';
import { csvFilename, toCsv } from './csv';
import { milestoneProgress, projectProgress } from './project-reports';
import type { ReportBuilder, ReportContext } from './report-context';
import { slaPerformance, ticketVolume } from './support-reports';
import { changeRequests, clientCompletedWork, taskCompletion, teamWorkload } from './work-reports';

const BUILDERS: Record<ReportType, ReportBuilder> = {
  [REPORT_TYPE.PROJECT_PROGRESS]: projectProgress,
  [REPORT_TYPE.MILESTONE_PROGRESS]: milestoneProgress,
  [REPORT_TYPE.CONTRACT_STATUS]: contractStatus,
  [REPORT_TYPE.SUPPORT_HOURS]: supportHours,
  [REPORT_TYPE.SLA_PERFORMANCE]: slaPerformance,
  [REPORT_TYPE.TICKET_VOLUME]: ticketVolume,
  [REPORT_TYPE.TASK_COMPLETION]: taskCompletion,
  [REPORT_TYPE.TEAM_WORKLOAD]: teamWorkload,
  [REPORT_TYPE.CLIENT_COMPLETED_WORK]: clientCompletedWork,
  [REPORT_TYPE.CHANGE_REQUESTS]: changeRequests,
};

/** Reports staff may run without report:read-all (scoped to the people they may see). */
const TEAM_SCOPED: readonly ReportType[] = [REPORT_TYPE.TASK_COMPLETION, REPORT_TYPE.TEAM_WORKLOAD];
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

export interface ReportTypeInfo {
  type: ReportType;
  label: string;
}

/**
 * Runs the Phase 2 reports. Every query is tenant-scoped on the backend: clients are pinned to
 * their organization and to client-visible data; staff need report:read-all for organization-wide
 * reports, otherwise only the team-scoped ones over the people they may see.
 */
@Injectable()
export class AdvancedReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsRepository,
    private readonly workLogs: WorkLogsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async available(actor: AuthenticatedUser): Promise<ReportTypeInfo[]> {
    let types: readonly ReportType[] = CLIENT_REPORT_TYPES;
    if (isInternalUser(actor)) {
      types = actor.permissions.includes(PERMISSIONS.REPORT_READ_ALL)
        ? ALL_REPORT_TYPES
        : TEAM_SCOPED;
    }
    return types.map((type) => ({ type, label: REPORT_TYPE_LABELS[type] }));
  }

  async run(actor: AuthenticatedUser, type: string, filters: ReportFilters): Promise<ReportResult> {
    const reportType = this.requireType(type);
    const ctx = await this.context(actor, reportType, filters);
    return BUILDERS[reportType](ctx);
  }

  /** CSV of the same rows the JSON endpoint returns; every export is audited. */
  async exportCsv(
    actor: AuthenticatedUser,
    type: string,
    filters: ReportFilters,
  ): Promise<{ filename: string; csv: string }> {
    const result = await this.run(actor, type, filters);
    await this.auditLog.record({
      action: AUDIT_ACTION.REPORT_EXPORTED,
      entityType: AUDIT_ENTITY_TYPE.REPORT,
      entityId: result.type,
      after: { format: 'csv', rows: result.rows.length, filters: result.filters },
    });
    return { filename: csvFilename(result), csv: toCsv(result) };
  }

  private requireType(type: string): ReportType {
    if (!(ALL_REPORT_TYPES as string[]).includes(type)) {
      throw new NotFoundException('Unknown report');
    }
    return type as ReportType;
  }

  private async context(
    actor: AuthenticatedUser,
    type: ReportType,
    filters: ReportFilters,
  ): Promise<ReportContext> {
    const { from, to } = this.range(filters);
    const now = new Date();
    if (!isInternalUser(actor)) {
      if (!CLIENT_REPORT_TYPES.includes(type)) {
        throw new ForbiddenException('This report is not available to client organizations');
      }
      const provider = await this.organizations.findServiceProvider();
      if (!provider) {
        throw new NotFoundException('Service provider organization is not configured');
      }
      return {
        prisma: this.prisma,
        organizationId: provider.id,
        clientOrganizationId: actor.organizationId,
        audience: 'client',
        money: { value: false, cost: false },
        // Clients may narrow by project / contract / status, never by other clients or people.
        filters: {
          from: filters.from,
          to: filters.to,
          projectId: filters.projectId,
          contractId: filters.contractId,
          status: filters.status,
        },
        from,
        to,
        now,
      };
    }
    const readAll = actor.permissions.includes(PERMISSIONS.REPORT_READ_ALL);
    if (!readAll && !TEAM_SCOPED.includes(type)) {
      throw new ForbiddenException('Organization-wide reports need the report:read-all permission');
    }
    const visibleUserIds = readAll
      ? undefined
      : await this.workLogs.visibleUserIds(actor, filters.userId);
    return {
      prisma: this.prisma,
      organizationId: actor.organizationId,
      clientOrganizationId: filters.clientOrganizationId,
      audience: 'internal',
      visibleUserIds,
      money: {
        value: actor.permissions.includes(PERMISSIONS.CONTRACT_READ),
        cost: actor.permissions.includes(PERMISSIONS.COST_READ),
      },
      filters,
      from,
      to,
      now,
    };
  }

  private range(filters: ReportFilters): { from: Date; to: Date } {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const to = filters.to ? new Date(filters.to) : today;
    const from = filters.from ? new Date(filters.from) : new Date(to.getTime() - 29 * DAY_MS);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException('The date range must start before it ends');
    }
    if ((to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      throw new BadRequestException('Reports cover at most one year at a time');
    }
    return { from, to };
  }
}
