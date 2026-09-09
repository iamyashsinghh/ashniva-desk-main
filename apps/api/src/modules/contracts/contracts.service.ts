import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CONTRACT_EXPIRY_WARNING_DAYS,
  CONTRACT_LIST_VIEW,
  CONTRACT_STATUS,
  PERMISSIONS,
  type AuthenticatedUser,
  type ContractDetail,
  type ContractHourBalance,
  type ContractSummary,
  type HourLedgerEntry,
  type PaginatedResponse,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import type { ContractStatus } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { MilestonesService } from '../milestones/milestones.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { contractPatchData, toDateOrNull } from './contract-patch';
import { showsBalance } from './contract-periods';
import {
  toContractDetail,
  toContractSummary,
  toLedgerEntry,
  type MoneyVisibility,
} from './contracts.mapper';
import {
  ContractsRepository,
  type ContractDetailRow,
  type ContractSummaryRow,
} from './contracts.repository';
import type { HourMovementDto, LedgerQueryDto } from './dto/contract-extras.dto';
import type {
  CreateContractDto,
  ListContractsQueryDto,
  UpdateContractDto,
} from './dto/contract.dto';
import { HourBalanceReader } from './hour-balance-reader.service';
import { HourLedgerService } from './hour-ledger.service';

/**
 * Contracts of every type with their documents, payment milestones and hour ledger. Money is
 * serialized only for callers allowed to see it; internal notes and costs never reach the
 * client portal, which has its own allow-list mappers (PortalContractsService).
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly contracts: ContractsRepository,
    private readonly ledger: HourLedgerService,
    private readonly balances: HourBalanceReader,
    private readonly milestones: MilestonesService,
    private readonly organizations: OrganizationsRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListContractsQueryDto,
  ): Promise<PaginatedResponse<ContractSummary>> {
    this.assertInternal(actor);
    const today = new Date();
    const view = query.view ?? CONTRACT_LIST_VIEW.ACTIVE;
    const statusByView: Record<string, ContractStatus[] | undefined> = {
      active: ['ACTIVE'],
      expiring: ['ACTIVE'],
      draft: ['DRAFT'],
      expired: ['EXPIRED'],
      archived: ['ARCHIVED'],
      all: undefined,
    };
    const page = await this.contracts.list({
      organizationId: actor.organizationId,
      clientOrganizationId: query.clientOrganizationId,
      projectId: query.projectId,
      status: statusByView[view],
      type: query.type,
      search: query.search,
      // Same window as the "Contracts expiring" KPI: still running, ending within the notice
      // period. Without the lower bound the list also showed contracts that already ended.
      endingBefore:
        view === CONTRACT_LIST_VIEW.EXPIRING
          ? new Date(today.getTime() + CONTRACT_EXPIRY_WARNING_DAYS * 86_400_000)
          : undefined,
      endingAfter: view === CONTRACT_LIST_VIEW.EXPIRING ? today : undefined,
      limit: query.limit,
      cursor: query.cursor,
    });
    // Balances for the whole page in one pair of read-only queries. Asking for them one row at a
    // time meant an interactive transaction per contract, and a page of 100 exhausted the pool.
    const balances = await this.balances.balances(page.items.filter(showsBalance), today);
    const items = page.items.map((row) =>
      toContractSummary(row, balances.get(row.id) ?? null, this.visibility(actor), today),
    );
    return { items, nextCursor: page.nextCursor, total: page.total };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<ContractDetail> {
    this.assertInternal(actor);
    const row = await this.requireDetail(actor, id);
    return this.detail(actor, row);
  }

  async create(actor: AuthenticatedUser, dto: CreateContractDto): Promise<ContractDetail> {
    this.assertInternal(actor);
    await this.assertClientOrganization(dto.clientOrganizationId);
    await this.assertProject(actor, dto.projectId, dto.clientOrganizationId);
    this.assertMoneyFields(actor, dto);
    const row = await this.contracts.create(actor.organizationId, {
      clientOrganizationId: dto.clientOrganizationId,
      projectId: dto.projectId ?? null,
      type: dto.type,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      scope: dto.scope?.trim() || null,
      status: dto.status ?? CONTRACT_STATUS.DRAFT,
      startDate: new Date(dto.startDate),
      endDate: toDateOrNull(dto.endDate) ?? null,
      renewalDate: toDateOrNull(dto.renewalDate) ?? null,
      renewalNoticeDays: dto.renewalNoticeDays ?? 30,
      autoRenew: dto.autoRenew ?? false,
      currency: dto.currency?.toUpperCase() ?? 'INR',
      contractValue: dto.contractValue ?? null,
      internalCost: dto.internalCost ?? null,
      includedMinutesPerPeriod: dto.includedMinutesPerPeriod ?? 0,
      billingPeriod: dto.billingPeriod ?? 'MONTHLY',
      carryForwardRule: dto.carryForwardRule ?? 'NONE',
      carryForwardCapMinutes: dto.carryForwardCapMinutes ?? null,
      lowHoursThresholdMinutes: dto.lowHoursThresholdMinutes ?? 300,
      internalNotes: dto.internalNotes?.trim() || null,
      clientNotes: dto.clientNotes?.trim() || null,
      createdById: actor.userId,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.CONTRACT_CREATED,
      entityType: AUDIT_ENTITY_TYPE.CONTRACT,
      entityId: row.id,
      after: { number: row.numberLabel, title: row.title, type: row.type, status: row.status },
    });
    return this.detail(actor, row);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateContractDto,
  ): Promise<ContractDetail> {
    this.assertInternal(actor);
    const before = await this.requireDetail(actor, id);
    if (before.status === CONTRACT_STATUS.ARCHIVED) {
      throw new BadRequestException('Archived contracts are read-only');
    }
    if (dto.projectId !== undefined) {
      await this.assertProject(actor, dto.projectId ?? undefined, before.clientOrganizationId);
    }
    this.assertMoneyFields(actor, dto);
    const data = contractPatchData(dto);
    const row = await this.contracts.update(id, data);
    await this.auditLog.record({
      action: AUDIT_ACTION.CONTRACT_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.CONTRACT,
      entityId: id,
      before: { status: before.status, title: before.title, endDate: before.endDate },
      after: {
        status: row.status,
        title: row.title,
        endDate: row.endDate,
        changed: Object.keys(data),
      },
    });
    return this.detail(actor, row);
  }

  async archive(actor: AuthenticatedUser, id: string): Promise<ContractDetail> {
    this.assertInternal(actor);
    const before = await this.requireDetail(actor, id);
    const row = await this.contracts.update(id, {
      status: CONTRACT_STATUS.ARCHIVED,
      archivedAt: new Date(),
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.CONTRACT_ARCHIVED,
      entityType: AUDIT_ENTITY_TYPE.CONTRACT,
      entityId: id,
      before: { status: before.status },
    });
    return this.detail(actor, row);
  }

  async ledgerPage(
    actor: AuthenticatedUser,
    id: string,
    query: LedgerQueryDto,
  ): Promise<PaginatedResponse<HourLedgerEntry>> {
    this.assertInternal(actor);
    await this.requireDetail(actor, id);
    const rows = await this.contracts.listLedger(id, {
      limit: query.limit,
      cursor: query.cursor,
      periodStart: query.periodStart ? new Date(query.periodStart) : undefined,
    });
    const items = rows.slice(0, query.limit);
    return {
      items: items.map(toLedgerEntry),
      nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async moveHours(
    actor: AuthenticatedUser,
    id: string,
    dto: HourMovementDto,
  ): Promise<ContractHourBalance> {
    this.assertInternal(actor);
    await this.requireDetail(actor, id);
    return this.ledger.post_manual(actor.userId, id, dto);
  }

  // ---- helpers ------------------------------------------------------------------------------

  private async detail(actor: AuthenticatedUser, row: ContractDetailRow): Promise<ContractDetail> {
    const [balance, milestones, ledger] = await Promise.all([
      this.balanceOf(row),
      this.milestones.summariesForContract(actor.organizationId, row.id),
      this.contracts.listLedger(row.id, { limit: 20 }),
    ]);
    return toContractDetail(row, balance, milestones, ledger.slice(0, 20), this.visibility(actor));
  }

  private balanceOf(row: ContractSummaryRow): Promise<ContractHourBalance | null> {
    return showsBalance(row) ? this.balances.balance(row) : Promise.resolve(null);
  }

  private visibility(actor: AuthenticatedUser): MoneyVisibility {
    return {
      value: actor.permissions.includes(PERMISSIONS.CONTRACT_READ),
      cost: actor.permissions.includes(PERMISSIONS.COST_READ),
    };
  }

  private async requireDetail(actor: AuthenticatedUser, id: string): Promise<ContractDetailRow> {
    const row = await this.contracts.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Contract not found');
    }
    return row;
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Contracts are managed by the service provider');
    }
  }

  private assertMoneyFields(actor: AuthenticatedUser, dto: { internalCost?: string | null }): void {
    if (dto.internalCost !== undefined && !actor.permissions.includes(PERMISSIONS.COST_READ)) {
      throw new ForbiddenException('Internal cost can only be set by people who may read costs');
    }
  }

  private async assertClientOrganization(clientOrganizationId: string): Promise<void> {
    const organization = await this.organizations.findById(clientOrganizationId);
    if (!organization || organization.isServiceProvider || organization.deletedAt) {
      throw new BadRequestException('Choose a client organization');
    }
  }

  private async assertProject(
    actor: AuthenticatedUser,
    projectId: string | undefined,
    clientOrganizationId: string,
  ) {
    if (!projectId) {
      return;
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.clientOrganizationId !== clientOrganizationId) {
      throw new BadRequestException('The project belongs to a different client');
    }
  }
}
