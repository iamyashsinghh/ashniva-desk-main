import {
  CONTRACT_EXPIRY_WARNING_DAYS,
  CONTRACT_STATUS,
  type BillingPeriod,
  type CarryForwardRule,
  type ContractDetail,
  type ContractHourBalance,
  type ContractStatus,
  type ContractSummary,
  type ContractType,
  type HourLedgerEntry,
  type HourLedgerKind,
  type MilestoneSummary,
  type PaymentMilestoneStatus,
  type PaymentMilestoneSummary,
  type PortalContractDetail,
  type PortalContractSummary,
  type FileSummary,
} from '@ashniva/types';

import { toFileSummary } from '../files/files.service';
import { toIsoDate, tracksHours } from './contract-periods';
import type { ContractDetailRow, ContractSummaryRow, LedgerRow } from './contracts.repository';

export interface MoneyVisibility {
  /** contract:read — may see the contract value. */
  value: boolean;
  /** cost:read — may see the internal cost. */
  cost: boolean;
}

/** Decimals are serialized as fixed two-place strings so "240000.00" survives the round trip. */
function money(value: { toFixed(places: number): string } | null): string | null {
  return value === null ? null : value.toFixed(2);
}

export function isExpiringSoon(
  row: { status: string; endDate: Date | null },
  today: Date,
): boolean {
  if (row.status !== CONTRACT_STATUS.ACTIVE || !row.endDate) {
    return false;
  }
  const limit = new Date(today.getTime() + CONTRACT_EXPIRY_WARNING_DAYS * 86_400_000);
  return row.endDate <= limit;
}

export function toContractSummary(
  row: ContractSummaryRow,
  hours: ContractHourBalance | null,
  visibility: MoneyVisibility,
  today = new Date(),
): ContractSummary {
  return {
    id: row.id,
    number: row.numberLabel,
    title: row.title,
    type: row.type as ContractType,
    status: row.status as ContractStatus,
    clientOrganization: row.clientOrganization,
    project: row.project,
    startDate: toIsoDate(row.startDate) ?? '',
    endDate: toIsoDate(row.endDate),
    renewalDate: toIsoDate(row.renewalDate),
    isExpiringSoon: isExpiringSoon(row, today),
    currency: row.currency,
    contractValue: visibility.value ? money(row.contractValue) : null,
    tracksHours: tracksHours(row),
    hours,
    openChangeRequestCount: row._count.changeRequests,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPaymentMilestone(
  row: ContractDetailRow['paymentMilestones'][number],
): PaymentMilestoneSummary {
  return {
    id: row.id,
    title: row.title,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    dueDate: toIsoDate(row.dueDate),
    status: row.status as PaymentMilestoneStatus,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    invoiceReference: row.invoiceReference,
    milestone: row.milestone,
    sortOrder: row.sortOrder,
  };
}

export function toLedgerEntry(row: LedgerRow): HourLedgerEntry {
  return {
    id: row.id,
    kind: row.kind as HourLedgerKind,
    minutes: row.minutes,
    balanceAfterMinutes: row.balanceAfterMinutes,
    periodStart: toIsoDate(row.periodStart) ?? '',
    periodEnd: toIsoDate(row.periodEnd),
    reason: row.reason,
    task: row.workLog
      ? {
          id: row.workLog.task.id,
          key: `${row.workLog.task.project.code}-${row.workLog.task.number}`,
          title: row.workLog.task.title,
        }
      : null,
    ticket: row.ticket,
    workLogId: row.workLogId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toContractDetail(
  row: ContractDetailRow,
  hours: ContractHourBalance | null,
  milestones: MilestoneSummary[],
  ledger: LedgerRow[],
  visibility: MoneyVisibility,
  today = new Date(),
): ContractDetail {
  return {
    ...toContractSummary(row, hours, visibility, today),
    description: row.description,
    scope: row.scope,
    internalNotes: row.internalNotes,
    internalCost: visibility.cost ? money(row.internalCost) : null,
    clientNotes: row.clientNotes,
    includedMinutesPerPeriod: row.includedMinutesPerPeriod,
    billingPeriod: row.billingPeriod as BillingPeriod,
    carryForwardRule: row.carryForwardRule as CarryForwardRule,
    carryForwardCapMinutes: row.carryForwardCapMinutes,
    lowHoursThresholdMinutes: row.lowHoursThresholdMinutes,
    autoRenew: row.autoRenew,
    renewalNoticeDays: row.renewalNoticeDays,
    milestones,
    paymentMilestones: row.paymentMilestones.map(toPaymentMilestone),
    documents: row.documents.map((file) =>
      toFileSummary(file as Parameters<typeof toFileSummary>[0]),
    ),
    recentLedger: ledger.map(toLedgerEntry),
    createdBy: row.createdBy,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

/** Portal allow-list: no money, no internal notes, no internal documents, no cost. */
export function toPortalContractSummary(
  row: ContractSummaryRow,
  hours: ContractHourBalance | null,
  today = new Date(),
): PortalContractSummary {
  return {
    id: row.id,
    number: row.numberLabel,
    title: row.title,
    type: row.type as ContractType,
    status: row.status as ContractStatus,
    project: row.project,
    startDate: toIsoDate(row.startDate) ?? '',
    endDate: toIsoDate(row.endDate),
    renewalDate: toIsoDate(row.renewalDate),
    isExpiringSoon: isExpiringSoon(row, today),
    tracksHours: tracksHours(row),
    hours,
  };
}

export function toPortalContractDetail(
  row: ContractDetailRow,
  hours: ContractHourBalance | null,
  milestones: MilestoneSummary[],
  ledger: LedgerRow[],
  documents: FileSummary[],
  today = new Date(),
): PortalContractDetail {
  return {
    ...toPortalContractSummary(row, hours, today),
    scope: row.scope,
    clientNotes: row.clientNotes,
    milestones,
    documents,
    recentLedger: ledger.map(toLedgerEntry),
  };
}
