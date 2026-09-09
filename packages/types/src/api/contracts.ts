import type {
  BillingPeriod,
  CarryForwardRule,
  ContractStatus,
  HourLedgerKind,
  PaymentMilestoneStatus,
} from '../domain/contract-status';
import type { ContractType } from '../domain/contract-type';
import type { OrganizationRef, UserRef } from './identity';
import type { MilestoneSummary } from './milestones';
import type { FileSummary, ProjectRef } from './work';

export interface ContractRef {
  id: string;
  /** "CT-2026-0007" */
  number: string;
  title: string;
}

/** Hour balance of a contract for the current billing period, in minutes. */
export interface ContractHourBalance {
  includedMinutes: number;
  purchasedMinutes: number;
  carriedForwardMinutes: number;
  consumedMinutes: number;
  reservedMinutes: number;
  adjustmentMinutes: number;
  expiredMinutes: number;
  /** included + purchased + carried + adjustments − consumed − reserved − expired */
  remainingMinutes: number;
  periodStart: string | null;
  periodEnd: string | null;
  /** True when remaining is at or below the configured low-hours threshold. */
  isLow: boolean;
}

export interface ContractSummary extends ContractRef {
  type: ContractType;
  status: ContractStatus;
  clientOrganization: OrganizationRef;
  project: ProjectRef | null;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  /** Derived: ACTIVE and ending within CONTRACT_EXPIRY_WARNING_DAYS. */
  isExpiringSoon: boolean;
  currency: string;
  /** Null when the caller may not see money (contract:read without cost:read still sees value). */
  contractValue: string | null;
  tracksHours: boolean;
  hours: ContractHourBalance | null;
  openChangeRequestCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMilestoneSummary {
  id: string;
  title: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  status: PaymentMilestoneStatus;
  paidAt: string | null;
  invoiceReference: string | null;
  milestone: { id: string; name: string } | null;
  sortOrder: number;
}

export interface HourLedgerEntry {
  id: string;
  kind: HourLedgerKind;
  /** Signed: credits are positive, debits negative. */
  minutes: number;
  balanceAfterMinutes: number;
  periodStart: string;
  periodEnd: string | null;
  reason: string | null;
  task: { id: string; key: string; title: string } | null;
  ticket: { id: string; number: number; title: string } | null;
  workLogId: string | null;
  createdBy: UserRef | null;
  createdAt: string;
}

export interface ContractDetail extends ContractSummary {
  description: string | null;
  scope: string | null;
  /** Internal only: never in portal responses. */
  internalNotes: string | null;
  /** Internal only and cost:read only. */
  internalCost: string | null;
  /** Shown to the client. */
  clientNotes: string | null;
  includedMinutesPerPeriod: number;
  billingPeriod: BillingPeriod;
  carryForwardRule: CarryForwardRule;
  carryForwardCapMinutes: number | null;
  lowHoursThresholdMinutes: number;
  autoRenew: boolean;
  renewalNoticeDays: number;
  milestones: MilestoneSummary[];
  paymentMilestones: PaymentMilestoneSummary[];
  /** INTERNAL and CLIENT files for staff; CLIENT only for the portal. */
  documents: FileSummary[];
  recentLedger: HourLedgerEntry[];
  createdBy: UserRef;
  archivedAt: string | null;
}

export const CONTRACT_LIST_VIEW = {
  ACTIVE: 'active',
  EXPIRING: 'expiring',
  DRAFT: 'draft',
  EXPIRED: 'expired',
  ARCHIVED: 'archived',
  ALL: 'all',
} as const;

export type ContractListView = (typeof CONTRACT_LIST_VIEW)[keyof typeof CONTRACT_LIST_VIEW];

/** Client-portal view of a contract: allow-list of client-visible fields only. */
export interface PortalContractSummary extends ContractRef {
  type: ContractType;
  status: ContractStatus;
  project: ProjectRef | null;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  isExpiringSoon: boolean;
  tracksHours: boolean;
  hours: ContractHourBalance | null;
}

export interface PortalContractDetail extends PortalContractSummary {
  scope: string | null;
  clientNotes: string | null;
  milestones: MilestoneSummary[];
  documents: FileSummary[];
  recentLedger: HourLedgerEntry[];
}
