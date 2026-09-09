import { CONTRACT_EXPIRY_WARNING_DAYS, HOUR_LEDGER_KIND, REPORT_TYPE } from '@ashniva/types';

import {
  computeBalance,
  periodContaining,
  tracksHours,
  type LedgerLike,
} from '../../contracts/contract-periods';
import {
  column,
  dateCell,
  finish,
  moneyCell,
  type ReportBuilder,
  type ReportRow,
} from './report-context';

const DAY_MS = 86_400_000;

function contractWhere(ctx: Parameters<ReportBuilder>[0]) {
  return {
    organizationId: ctx.organizationId,
    deletedAt: null,
    ...(ctx.clientOrganizationId ? { clientOrganizationId: ctx.clientOrganizationId } : {}),
    ...(ctx.filters.projectId ? { projectId: ctx.filters.projectId } : {}),
    ...(ctx.filters.contractId ? { id: ctx.filters.contractId } : {}),
    ...(ctx.filters.status ? { status: ctx.filters.status as never } : {}),
    ...(ctx.audience === 'client' ? { status: { not: 'DRAFT' as const } } : {}),
  };
}

/** Contracts with dates, renewal state and (for staff with the permissions) value and cost. */
export const contractStatus: ReportBuilder = async (ctx) => {
  const contracts = await ctx.prisma.contract.findMany({
    where: contractWhere(ctx),
    include: {
      clientOrganization: { select: { name: true } },
      project: { select: { code: true } },
      paymentMilestones: { where: { deletedAt: null }, select: { status: true, amount: true } },
    },
    orderBy: [{ endDate: { sort: 'asc', nulls: 'last' } }, { numberLabel: 'asc' }],
  });
  const today = new Date(ctx.now.toISOString().slice(0, 10));
  const showValue = ctx.audience === 'internal' && ctx.money.value;
  const showCost = ctx.audience === 'internal' && ctx.money.cost;
  const rows: ReportRow[] = contracts.map((contract) => {
    const daysLeft = contract.endDate
      ? Math.round((contract.endDate.getTime() - today.getTime()) / DAY_MS)
      : null;
    const paid = contract.paymentMilestones.filter((item) => item.status === 'PAID');
    const row: ReportRow = {
      number: contract.numberLabel,
      title: contract.title,
      client: contract.clientOrganization.name,
      project: contract.project?.code ?? '',
      type: contract.type,
      status: contract.status,
      startDate: dateCell(contract.startDate),
      endDate: dateCell(contract.endDate),
      daysLeft,
      expiringSoon: daysLeft !== null && daysLeft >= 0 && daysLeft <= CONTRACT_EXPIRY_WARNING_DAYS,
      renewalDate: dateCell(contract.renewalDate),
      autoRenew: contract.autoRenew,
      paymentMilestones: contract.paymentMilestones.length,
      paymentsPaid: paid.length,
    };
    if (showValue) {
      row.currency = contract.currency;
      row.contractValue = moneyCell(contract.contractValue);
      row.amountPaid = paid.reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2);
    }
    if (showCost) {
      row.internalCost = moneyCell(contract.internalCost);
      row.margin =
        contract.contractValue && contract.internalCost
          ? (Number(contract.contractValue) - Number(contract.internalCost)).toFixed(2)
          : null;
    }
    return row;
  });
  return finish(
    ctx,
    REPORT_TYPE.CONTRACT_STATUS,
    'Contract status and renewals',
    [
      column('number', 'Contract'),
      column('title', 'Title'),
      column('client', 'Client'),
      column('project', 'Project'),
      column('type', 'Type', 'status'),
      column('status', 'Status', 'status'),
      column('startDate', 'Start', 'date'),
      column('endDate', 'End', 'date'),
      column('daysLeft', 'Days left', 'number'),
      column('expiringSoon', 'Expiring soon'),
      column('renewalDate', 'Renewal', 'date'),
      column('autoRenew', 'Auto-renew'),
      column('paymentMilestones', 'Payment milestones', 'number'),
      column('paymentsPaid', 'Paid', 'number'),
      ...(showValue
        ? [
            column('currency', 'Currency'),
            column('contractValue', 'Value', 'money'),
            column('amountPaid', 'Amount paid', 'money'),
          ]
        : []),
      ...(showCost
        ? [column('internalCost', 'Internal cost', 'money'), column('margin', 'Margin', 'money')]
        : []),
    ],
    rows,
    [
      { label: 'Contracts', value: rows.length },
      { label: 'Active', value: rows.filter((row) => row.status === 'ACTIVE').length },
      {
        label: 'Expiring within 30 days',
        value: rows.filter((row) => row.expiringSoon === true).length,
      },
    ],
  );
};

/** Support hours per contract for the current period: included, purchased, used, remaining. */
export const supportHours: ReportBuilder = async (ctx) => {
  const contracts = await ctx.prisma.contract.findMany({
    where: { ...contractWhere(ctx), status: { in: ['ACTIVE', 'EXPIRED'] } },
    include: {
      clientOrganization: { select: { name: true } },
      project: { select: { code: true } },
    },
    orderBy: { numberLabel: 'asc' },
  });
  const tracked = contracts.filter(tracksHours).map((contract) => ({
    contract,
    period: periodContaining(contract, ctx.now),
  }));
  // Two grouped queries for the whole report. It used to be a findMany and an aggregate per
  // contract, in sequence: 300 contracts cost 601 round trips.
  const [periodTotals, rangeTotals] = await Promise.all([
    tracked.length === 0
      ? []
      : ctx.prisma.contractHourLedger.groupBy({
          by: ['contractId', 'kind'],
          where: {
            OR: tracked.map((entry) => ({
              contractId: entry.contract.id,
              periodStart: entry.period.start,
            })),
          },
          _sum: { minutes: true },
        }),
    tracked.length === 0
      ? []
      : ctx.prisma.contractHourLedger.groupBy({
          by: ['contractId'],
          where: {
            contractId: { in: tracked.map((entry) => entry.contract.id) },
            kind: HOUR_LEDGER_KIND.CONSUMED,
            createdAt: { gte: ctx.from, lt: new Date(ctx.to.getTime() + DAY_MS) },
          },
          _sum: { minutes: true },
        }),
  ]);
  // One row per (contract, kind) with the minutes already summed is what computeBalance wants:
  // it sums per kind itself, so a pre-summed row per kind gives the same answer.
  const perPeriod = new Map<string, LedgerLike[]>();
  for (const row of periodTotals) {
    const bucket = perPeriod.get(row.contractId) ?? [];
    bucket.push({ kind: row.kind, minutes: row._sum.minutes ?? 0 });
    perPeriod.set(row.contractId, bucket);
  }
  const perRange = new Map(rangeTotals.map((row) => [row.contractId, row._sum.minutes ?? 0]));

  const rows: ReportRow[] = [];
  for (const { contract, period } of tracked) {
    const balance = computeBalance(
      perPeriod.get(contract.id) ?? [],
      period,
      contract.lowHoursThresholdMinutes,
    );
    rows.push({
      number: contract.numberLabel,
      title: contract.title,
      client: contract.clientOrganization.name,
      project: contract.project?.code ?? '',
      billingPeriod: contract.billingPeriod,
      periodStart: balance.periodStart,
      periodEnd: balance.periodEnd,
      includedMinutes: balance.includedMinutes,
      purchasedMinutes: balance.purchasedMinutes,
      carriedForwardMinutes: balance.carriedForwardMinutes,
      consumedMinutes: balance.consumedMinutes,
      reservedMinutes: balance.reservedMinutes,
      remainingMinutes: balance.remainingMinutes,
      consumedInRangeMinutes: Math.abs(perRange.get(contract.id) ?? 0),
      isLow: balance.isLow,
    });
  }
  return finish(
    ctx,
    REPORT_TYPE.SUPPORT_HOURS,
    'Support hours',
    [
      column('number', 'Contract'),
      column('title', 'Title'),
      column('client', 'Client'),
      column('project', 'Project'),
      column('billingPeriod', 'Billing period', 'status'),
      column('periodStart', 'Period start', 'date'),
      column('periodEnd', 'Period end', 'date'),
      column('includedMinutes', 'Included', 'minutes'),
      column('purchasedMinutes', 'Purchased', 'minutes'),
      column('carriedForwardMinutes', 'Carried forward', 'minutes'),
      column('consumedMinutes', 'Used this period', 'minutes'),
      column('reservedMinutes', 'Reserved', 'minutes'),
      column('remainingMinutes', 'Remaining', 'minutes'),
      column('consumedInRangeMinutes', 'Used in date range', 'minutes'),
      column('isLow', 'Low'),
    ],
    rows,
    [
      { label: 'Contracts tracking hours', value: rows.length },
      {
        label: 'Remaining (hours)',
        value: (rows.reduce((sum, row) => sum + Number(row.remainingMinutes), 0) / 60).toFixed(1),
      },
      { label: 'Running low', value: rows.filter((row) => row.isLow === true).length },
    ],
  );
};
