import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  HOUR_LEDGER_KIND,
  type ContractHourBalance,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { Prisma, type Contract, type HourLedgerKind } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import {
  carryForwardMinutes,
  computeBalance,
  dateOnly,
  periodContaining,
  tracksHours,
  type PeriodBounds,
} from './contract-periods';
import { ContractsRepository, type Db } from './contracts.repository';

export interface LedgerMovement {
  kind: HourLedgerKind;
  /** Signed minutes; the service validates the sign for each kind. */
  minutes: number;
  reason?: string | null;
  idempotencyKey?: string | null;
  workLogId?: string | null;
  ticketId?: string | null;
  createdById?: string | null;
}

export interface ConsumeResult {
  consumed: boolean;
  balance: ContractHourBalance;
}

const UNIQUE_VIOLATION = 'P2002';

/**
 * Support-hour accounting. Every movement is written inside a transaction that first locks the
 * contract row (SELECT … FOR UPDATE), so two approvals can never both read the same balance;
 * each row stores the balance after it, and a partial unique index makes a second CONSUMED row
 * for the same work log impossible even if two workers race past the lock.
 */
@Injectable()
export class HourLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Balance of the period containing `on`, **opening it** (with carry-forward) if needed.
   *
   * This is a write. It locks the contract row and can insert a period and its opening ledger
   * rows, so it belongs to the paths that change the ledger and to the daily job — never to a
   * GET. Read paths use `HourBalanceReader`, which neither locks nor writes.
   *
   * The contract row is the caller's: everything that needs a balance has just read one, and
   * re-fetching it here bought nothing but another round trip.
   */
  async ensureCurrentBalance(
    contract: Contract,
    on = new Date(),
  ): Promise<ContractHourBalance | null> {
    if (!tracksHours(contract)) {
      return null;
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, contract.id);
      const period = await this.ensurePeriod(tx, contract, on);
      return this.readBalance(tx, contract, period);
    });
  }

  /**
   * Deducts an approved work log. Idempotent: a second call for the same work log is a no-op,
   * both by the pre-check and by the database index. Balances may go negative — the low-hours
   * notification, not a hard stop, is the agreed behaviour for approved client work.
   */
  async consumeWorkLog(input: {
    contractId: string;
    workLogId: string;
    ticketId?: string | null;
    minutes: number;
    workDate: Date;
    actorUserId: string;
  }): Promise<ConsumeResult> {
    if (input.minutes <= 0) {
      throw new BadRequestException('Consumed minutes must be positive');
    }
    return this.prisma.$transaction(async (tx) => {
      const contract = await this.requireContract(tx, input.contractId);
      await this.lock(tx, contract.id);
      const already = await tx.contractHourLedger.findFirst({
        where: { workLogId: input.workLogId, kind: HOUR_LEDGER_KIND.CONSUMED },
      });
      const period = await this.ensurePeriod(tx, contract, input.workDate);
      if (already) {
        return { consumed: false, balance: await this.readBalance(tx, contract, period) };
      }
      try {
        await this.post(tx, contract, period, {
          kind: HOUR_LEDGER_KIND.CONSUMED,
          minutes: -input.minutes,
          workLogId: input.workLogId,
          ticketId: input.ticketId ?? null,
          createdById: input.actorUserId,
          reason: null,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_VIOLATION
        ) {
          return { consumed: false, balance: await this.readBalance(tx, contract, period) };
        }
        throw error;
      }
      const balance = await this.readBalance(tx, contract, period);
      await this.auditLog.record({
        action: AUDIT_ACTION.CONTRACT_HOURS_CONSUMED,
        entityType: AUDIT_ENTITY_TYPE.CONTRACT,
        entityId: contract.id,
        organizationId: contract.organizationId,
        after: {
          workLogId: input.workLogId,
          minutes: input.minutes,
          remaining: balance.remainingMinutes,
        },
      });
      return { consumed: true, balance };
    });
  }

  /** Purchased hours, manual adjustments, reservations and releases — all with a reason. */
  async post_manual(
    actorUserId: string,
    contractId: string,
    movement: LedgerMovement,
  ): Promise<ContractHourBalance> {
    const reason = movement.reason?.trim();
    if (!reason) {
      throw new BadRequestException('A reason is required for every manual hour movement');
    }
    const minutes = this.signedMinutes(movement.kind, movement.minutes);
    return this.prisma.$transaction(async (tx) => {
      const contract = await this.requireContract(tx, contractId);
      await this.lock(tx, contract.id);
      const period = await this.ensurePeriod(tx, contract, new Date());
      if (movement.idempotencyKey) {
        const existing = await tx.contractHourLedger.findFirst({
          where: { contractId, idempotencyKey: movement.idempotencyKey },
        });
        if (existing) {
          return this.readBalance(tx, contract, period);
        }
      }
      await this.post(tx, contract, period, {
        ...movement,
        minutes,
        reason,
        createdById: actorUserId,
        ticketId: movement.ticketId ?? null,
      });
      const balance = await this.readBalance(tx, contract, period);
      await this.auditLog.record({
        action: AUDIT_ACTION.CONTRACT_HOURS_ADJUSTED,
        entityType: AUDIT_ENTITY_TYPE.CONTRACT,
        entityId: contract.id,
        organizationId: contract.organizationId,
        after: { kind: movement.kind, minutes, reason, remaining: balance.remainingMinutes },
      });
      return balance;
    });
  }

  /**
   * Opens the current period of every hour-tracking contract (daily job). Opening a period
   * closes the previous one: unused hours expire or carry forward per the contract's rule.
   */
  async rolloverAll(on = new Date()): Promise<number> {
    const contracts = await this.contracts.listActiveHourContracts(on);
    let opened = 0;
    for (const contract of contracts) {
      opened += await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, contract.id);
        const before = await tx.contractPeriod.count({ where: { contractId: contract.id } });
        await this.ensurePeriod(tx, contract, on);
        const after = await tx.contractPeriod.count({ where: { contractId: contract.id } });
        return after - before;
      });
    }
    return opened;
  }

  // ---- internals ------------------------------------------------------------------------------

  private async requireContract(tx: Db, id: string): Promise<Contract> {
    const contract = await tx.contract.findFirst({ where: { id, deletedAt: null } });
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }
    if (!tracksHours(contract)) {
      throw new BadRequestException('This contract does not track hours');
    }
    return contract;
  }

  private async lock(tx: Db, contractId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE`;
  }

  /**
   * Makes sure the period containing `on` exists. When it is new and a previous period is
   * still open, the previous one is closed first: its remaining balance either expires or is
   * carried forward, and the new period receives its included hours.
   */
  private async ensurePeriod(tx: Db, contract: Contract, on: Date): Promise<PeriodBounds> {
    const bounds = periodContaining(contract, on);
    const existing = await tx.contractPeriod.findUnique({
      where: { contractId_periodStart: { contractId: contract.id, periodStart: bounds.start } },
    });
    if (existing) {
      return bounds;
    }
    const previous = await tx.contractPeriod.findFirst({
      where: { contractId: contract.id, closedAt: null, periodStart: { lt: bounds.start } },
      orderBy: { periodStart: 'desc' },
    });
    let carried = 0;
    if (previous) {
      const previousBounds = { start: previous.periodStart, end: previous.periodEnd };
      const balance = await this.readBalance(tx, contract, previousBounds);
      carried = carryForwardMinutes(
        contract.carryForwardRule,
        contract.carryForwardCapMinutes,
        balance.remainingMinutes,
      );
      const expired = balance.remainingMinutes - carried;
      if (expired > 0) {
        await this.post(tx, contract, previousBounds, {
          kind: HOUR_LEDGER_KIND.EXPIRED,
          minutes: -expired,
          reason: 'Unused hours at the end of the billing period',
        });
      }
      await tx.contractPeriod.update({
        where: { id: previous.id },
        data: { closedAt: new Date() },
      });
      await this.auditLog.record({
        action: AUDIT_ACTION.CONTRACT_PERIOD_CLOSED,
        entityType: AUDIT_ENTITY_TYPE.CONTRACT,
        entityId: contract.id,
        organizationId: contract.organizationId,
        after: { periodStart: previous.periodStart, carried, expired: Math.max(0, expired) },
      });
    }
    await tx.contractPeriod.create({
      data: { contractId: contract.id, periodStart: bounds.start, periodEnd: bounds.end },
    });
    if (contract.includedMinutesPerPeriod > 0) {
      await this.post(tx, contract, bounds, {
        kind: HOUR_LEDGER_KIND.INCLUDED,
        minutes: contract.includedMinutesPerPeriod,
        reason: 'Included hours for the billing period',
      });
    }
    if (carried > 0) {
      await this.post(tx, contract, bounds, {
        kind: HOUR_LEDGER_KIND.CARRY_FORWARD,
        minutes: carried,
        reason: 'Carried forward from the previous billing period',
      });
    }
    return bounds;
  }

  private async readBalance(
    tx: Db,
    contract: Contract,
    period: PeriodBounds,
  ): Promise<ContractHourBalance> {
    const rows = await tx.contractHourLedger.findMany({
      where: { contractId: contract.id, periodStart: period.start },
      select: { kind: true, minutes: true },
    });
    return computeBalance(rows, period, contract.lowHoursThresholdMinutes);
  }

  private async post(tx: Db, contract: Contract, period: PeriodBounds, movement: LedgerMovement) {
    const current = await this.readBalance(tx, contract, period);
    return tx.contractHourLedger.create({
      data: {
        organizationId: contract.organizationId,
        contractId: contract.id,
        kind: movement.kind,
        minutes: movement.minutes,
        balanceAfterMinutes: current.remainingMinutes + movement.minutes,
        periodStart: dateOnly(period.start),
        periodEnd: dateOnly(period.end),
        workLogId: movement.workLogId ?? null,
        ticketId: movement.ticketId ?? null,
        reason: movement.reason ?? null,
        idempotencyKey: movement.idempotencyKey ?? null,
        createdById: movement.createdById ?? null,
      },
    });
  }

  private signedMinutes(kind: HourLedgerKind, minutes: number): number {
    const magnitude = Math.abs(Math.trunc(minutes));
    if (magnitude === 0) {
      throw new BadRequestException('Minutes must not be zero');
    }
    switch (kind) {
      case HOUR_LEDGER_KIND.PURCHASED:
      case HOUR_LEDGER_KIND.RELEASED:
        return magnitude;
      case HOUR_LEDGER_KIND.RESERVED:
        return -magnitude;
      case HOUR_LEDGER_KIND.ADJUSTMENT:
        return Math.trunc(minutes);
      default:
        throw new BadRequestException(`${kind} movements are posted by the system, not by hand`);
    }
  }
}
