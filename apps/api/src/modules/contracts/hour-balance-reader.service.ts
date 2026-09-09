import { Injectable } from '@nestjs/common';
import {
  HOUR_LEDGER_KIND,
  type BillingPeriod,
  type CarryForwardRule,
  type ContractHourBalance,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import {
  carryForwardMinutes,
  computeBalance,
  periodContaining,
  tracksHours,
  type LedgerLike,
  type PeriodBounds,
} from './contract-periods';

/**
 * The contract fields a balance is computed from. Declared structurally so every shape that
 * carries a contract row — summary, detail, the daily job's plain row — satisfies it without
 * being re-fetched.
 */
export interface HourContract {
  id: string;
  startDate: Date;
  endDate: Date | null;
  billingPeriod: BillingPeriod;
  carryForwardRule: CarryForwardRule;
  carryForwardCapMinutes: number | null;
  includedMinutesPerPeriod: number;
  lowHoursThresholdMinutes: number;
  type: string;
}

interface Target {
  contract: HourContract;
  bounds: PeriodBounds;
}

interface PeriodRow {
  contractId: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Support-hour balances for **read** paths: the contract list, the client portal and the detail
 * screens.
 *
 * `HourLedgerService.ensureCurrentBalance` is the other way to get a balance, and it is not this
 * one. That one opens the billing period if it is not open yet, which means a lock
 * (`SELECT … FOR UPDATE`) and inserts, inside an interactive transaction. Doing that once per row
 * of a list is what turned `GET /contracts?limit=100` into a hundred concurrent interactive
 * transactions against a pool of eleven — a 500 from Prisma's transaction-start timeout — and it
 * also meant a GET wrote rows.
 *
 * So this service never locks and never writes. When the current period is already open it sums
 * that period's ledger. When it is not, it *projects* what opening it would produce — the
 * included minutes plus whatever the previous period would carry forward, exactly the arithmetic
 * `ensurePeriod` performs — so the number a reader sees is the same either way. The period is
 * still opened for real, by the write paths and by the daily rollover job.
 *
 * Everything is batched: two queries for a whole page, plus two more only when some contract's
 * period has yet to be opened.
 */
@Injectable()
export class HourBalanceReader {
  constructor(private readonly prisma: PrismaService) {}

  /** One contract's balance, or null when the contract does not keep an hour ledger. */
  async balance(contract: HourContract, on = new Date()): Promise<ContractHourBalance | null> {
    const balances = await this.balances([contract], on);
    return balances.get(contract.id) ?? null;
  }

  /** Balances for a whole page, keyed by contract id. Contracts without a ledger are absent. */
  async balances(
    contracts: readonly HourContract[],
    on = new Date(),
  ): Promise<Map<string, ContractHourBalance>> {
    const targets: Target[] = contracts
      .filter((contract) => tracksHours(contract))
      .map((contract) => ({ contract, bounds: periodContaining(contract, on) }));
    const result = new Map<string, ContractHourBalance>();
    if (targets.length === 0) {
      return result;
    }
    const [openPeriods, ledgerRows] = await Promise.all([
      this.prisma.contractPeriod.findMany({
        where: { OR: targets.map(periodKey) },
        select: { contractId: true },
      }),
      this.prisma.contractHourLedger.findMany({
        where: { OR: targets.map(periodKey) },
        select: { contractId: true, kind: true, minutes: true },
      }),
    ]);
    const open = new Set(openPeriods.map((row) => row.contractId));
    const byContract = groupByContract(ledgerRows);
    const unopened: Target[] = [];
    for (const target of targets) {
      if (open.has(target.contract.id)) {
        result.set(target.contract.id, balanceOf(target, byContract.get(target.contract.id) ?? []));
      } else {
        unopened.push(target);
      }
    }
    for (const [id, balance] of await this.project(unopened)) {
      result.set(id, balance);
    }
    return result;
  }

  /**
   * What the period containing `on` would hold the moment it is opened. `ensurePeriod` closes the
   * previous period first and moves its remaining minutes forward under the contract's rule; this
   * reproduces that sum without writing either half of it.
   */
  private async project(targets: readonly Target[]): Promise<Map<string, ContractHourBalance>> {
    const result = new Map<string, ContractHourBalance>();
    if (targets.length === 0) {
      return result;
    }
    // Still-open earlier periods. `ensurePeriod` closes one as it opens the next, so a contract
    // normally has at most one; taking the newest per contract is the same choice it makes.
    const rows = await this.prisma.contractPeriod.findMany({
      where: {
        OR: targets.map((target) => ({
          contractId: target.contract.id,
          closedAt: null,
          periodStart: { lt: target.bounds.start },
        })),
      },
      select: { contractId: true, periodStart: true, periodEnd: true },
      orderBy: { periodStart: 'desc' },
    });
    const newest = new Map<string, PeriodRow>();
    for (const row of rows) {
      if (!newest.has(row.contractId)) {
        newest.set(row.contractId, row);
      }
    }
    const previousLedger =
      newest.size === 0
        ? []
        : await this.prisma.contractHourLedger.findMany({
            where: {
              OR: [...newest.values()].map((row) => ({
                contractId: row.contractId,
                periodStart: row.periodStart,
              })),
            },
            select: { contractId: true, kind: true, minutes: true },
          });
    const previousByContract = groupByContract(previousLedger);
    for (const target of targets) {
      const previous = newest.get(target.contract.id);
      let carried = 0;
      if (previous) {
        const before = computeBalance(
          previousByContract.get(target.contract.id) ?? [],
          { start: previous.periodStart, end: previous.periodEnd },
          target.contract.lowHoursThresholdMinutes,
        );
        carried = carryForwardMinutes(
          target.contract.carryForwardRule,
          target.contract.carryForwardCapMinutes,
          before.remainingMinutes,
        );
      }
      const projected: LedgerLike[] = [];
      if (target.contract.includedMinutesPerPeriod > 0) {
        projected.push({
          kind: HOUR_LEDGER_KIND.INCLUDED,
          minutes: target.contract.includedMinutesPerPeriod,
        });
      }
      if (carried > 0) {
        projected.push({ kind: HOUR_LEDGER_KIND.CARRY_FORWARD, minutes: carried });
      }
      result.set(target.contract.id, balanceOf(target, projected));
    }
    return result;
  }
}

function periodKey(target: Target): { contractId: string; periodStart: Date } {
  return { contractId: target.contract.id, periodStart: target.bounds.start };
}

function balanceOf(target: Target, rows: readonly LedgerLike[]): ContractHourBalance {
  return computeBalance(rows, target.bounds, target.contract.lowHoursThresholdMinutes);
}

function groupByContract<T extends { contractId: string }>(rows: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const existing = grouped.get(row.contractId);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.contractId, [row]);
    }
  }
  return grouped;
}
