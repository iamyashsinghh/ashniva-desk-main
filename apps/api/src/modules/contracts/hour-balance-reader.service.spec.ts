import { HOUR_LEDGER_KIND } from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import { HourBalanceReader, type HourContract } from './hour-balance-reader.service';

interface LedgerRow {
  contractId: string;
  kind: string;
  minutes: number;
  periodStart: Date;
}

interface PeriodRow {
  contractId: string;
  periodStart: Date;
  periodEnd: Date;
  closedAt: Date | null;
}

/**
 * A Prisma stand-in that answers the two collections the reader touches and records every call,
 * so the tests can assert the number of round trips as well as the arithmetic — the point of the
 * service is that a page costs a fixed number of queries and writes nothing.
 */
function fakePrisma(periods: PeriodRow[], ledger: LedgerRow[]) {
  const calls: string[] = [];
  const matches = (row: { contractId: string; periodStart: Date }, or: unknown): boolean =>
    (or as Array<{ contractId: string; periodStart?: Date | { lt: Date }; closedAt?: null }>).some(
      (clause) => {
        if (clause.contractId !== row.contractId) {
          return false;
        }
        if (clause.periodStart instanceof Date) {
          return clause.periodStart.getTime() === row.periodStart.getTime();
        }
        if (clause.periodStart && 'lt' in clause.periodStart) {
          return row.periodStart.getTime() < clause.periodStart.lt.getTime();
        }
        return true;
      },
    );
  const prisma = {
    contractPeriod: {
      findMany: (args: { where: { OR: unknown; closedAt?: null } }) => {
        calls.push('contractPeriod.findMany');
        const open = JSON.stringify(args.where).includes('"closedAt":null');
        return Promise.resolve(
          periods
            .filter((row) => matches(row, args.where.OR) && (!open || row.closedAt === null))
            .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime()),
        );
      },
    },
    contractHourLedger: {
      findMany: (args: { where: { OR: unknown } }) => {
        calls.push('contractHourLedger.findMany');
        return Promise.resolve(ledger.filter((row) => matches(row, args.where.OR)));
      },
    },
  };
  // The reader touches two of PrismaService's dozens of delegates; the cast is the seam.
  return { prisma: prisma as unknown as PrismaService, calls };
}

const contract = (overrides: Partial<HourContract> = {}): HourContract => ({
  id: 'c1',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2027-12-31T00:00:00.000Z'),
  billingPeriod: 'MONTHLY',
  carryForwardRule: 'NONE',
  carryForwardCapMinutes: null,
  includedMinutesPerPeriod: 600,
  lowHoursThresholdMinutes: 60,
  type: 'SUPPORT_HOURS',
  ...overrides,
});

const MARCH = new Date('2026-03-10T09:00:00.000Z');
const MARCH_START = new Date('2026-03-01T00:00:00.000Z');
const FEBRUARY_START = new Date('2026-02-01T00:00:00.000Z');
const FEBRUARY_END = new Date('2026-02-28T00:00:00.000Z');

describe('HourBalanceReader', () => {
  it('sums the open period and asks for the whole page in two queries', async () => {
    const contracts = [contract({ id: 'a' }), contract({ id: 'b' }), contract({ id: 'c' })];
    const { prisma, calls } = fakePrisma(
      contracts.map((row) => ({
        contractId: row.id,
        periodStart: MARCH_START,
        periodEnd: new Date('2026-03-31T00:00:00.000Z'),
        closedAt: null,
      })),
      [
        {
          contractId: 'a',
          kind: HOUR_LEDGER_KIND.INCLUDED,
          minutes: 600,
          periodStart: MARCH_START,
        },
        {
          contractId: 'a',
          kind: HOUR_LEDGER_KIND.CONSUMED,
          minutes: -90,
          periodStart: MARCH_START,
        },
        {
          contractId: 'b',
          kind: HOUR_LEDGER_KIND.INCLUDED,
          minutes: 600,
          periodStart: MARCH_START,
        },
        {
          contractId: 'c',
          kind: HOUR_LEDGER_KIND.INCLUDED,
          minutes: 600,
          periodStart: MARCH_START,
        },
        {
          contractId: 'c',
          kind: HOUR_LEDGER_KIND.CONSUMED,
          minutes: -580,
          periodStart: MARCH_START,
        },
      ],
    );

    const balances = await new HourBalanceReader(prisma).balances(contracts, MARCH);

    expect(balances.get('a')?.remainingMinutes).toBe(510);
    expect(balances.get('a')?.consumedMinutes).toBe(90);
    expect(balances.get('b')?.remainingMinutes).toBe(600);
    expect(balances.get('c')?.isLow).toBe(true);
    expect(balances.get('a')?.periodStart).toBe('2026-03-01');
    // Two queries for three contracts, and none of them a write or a transaction.
    expect(calls).toEqual(['contractPeriod.findMany', 'contractHourLedger.findMany']);
  });

  it('projects an unopened period exactly as opening it would, without writing', async () => {
    const rows = [contract({ id: 'a', carryForwardRule: 'CAPPED', carryForwardCapMinutes: 120 })];
    const { prisma, calls } = fakePrisma(
      [
        {
          contractId: 'a',
          periodStart: FEBRUARY_START,
          periodEnd: FEBRUARY_END,
          closedAt: null,
        },
      ],
      [
        {
          contractId: 'a',
          kind: HOUR_LEDGER_KIND.INCLUDED,
          minutes: 600,
          periodStart: FEBRUARY_START,
        },
        {
          contractId: 'a',
          kind: HOUR_LEDGER_KIND.CONSUMED,
          minutes: -60,
          periodStart: FEBRUARY_START,
        },
      ],
    );

    const balance = await new HourBalanceReader(prisma).balance(rows[0] as HourContract, MARCH);

    // February leaves 540 remaining; the cap moves 120 of it forward, on top of March's 600.
    expect(balance?.includedMinutes).toBe(600);
    expect(balance?.carriedForwardMinutes).toBe(120);
    expect(balance?.remainingMinutes).toBe(720);
    expect(balance?.periodStart).toBe('2026-03-01');
    expect(calls).toHaveLength(4);
    expect(calls.filter((call) => call.endsWith('create') || call.endsWith('update'))).toEqual([]);
  });

  it('carries nothing forward under the NONE rule', async () => {
    const rows = [contract({ id: 'a' })];
    const { prisma } = fakePrisma(
      [{ contractId: 'a', periodStart: FEBRUARY_START, periodEnd: FEBRUARY_END, closedAt: null }],
      [
        {
          contractId: 'a',
          kind: HOUR_LEDGER_KIND.INCLUDED,
          minutes: 600,
          periodStart: FEBRUARY_START,
        },
      ],
    );

    const balance = await new HourBalanceReader(prisma).balance(rows[0] as HourContract, MARCH);

    expect(balance?.carriedForwardMinutes).toBe(0);
    expect(balance?.remainingMinutes).toBe(600);
  });

  it('returns nothing for a contract that keeps no hour ledger, and asks no questions', async () => {
    const { prisma, calls } = fakePrisma([], []);

    const balance = await new HourBalanceReader(prisma).balance(
      contract({ type: 'FIXED_PRICE', includedMinutesPerPeriod: 0 }),
      MARCH,
    );

    expect(balance).toBeNull();
    expect(calls).toEqual([]);
  });
});
