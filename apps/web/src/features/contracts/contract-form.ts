import {
  BILLING_PERIOD,
  CARRY_FORWARD_RULE,
  CONTRACT_STATUS,
  CONTRACT_TYPE,
  type ContractDetail,
} from '@ashniva/types';

import { todayIso } from '../../shared/lib/format';
import type { ContractInput } from './api';

/** Contract form state: hours are edited in hours, the API stores minutes. */
export interface ContractFormState {
  clientOrganizationId: string;
  projectId: string;
  type: ContractDetail['type'];
  title: string;
  scope: string;
  status: ContractDetail['status'];
  startDate: string;
  endDate: string;
  renewalDate: string;
  autoRenew: boolean;
  currency: string;
  contractValue: string;
  internalCost: string;
  includedHours: string;
  billingPeriod: ContractDetail['billingPeriod'];
  carryForwardRule: ContractDetail['carryForwardRule'];
  carryForwardCapHours: string;
  lowHoursThresholdHours: string;
  internalNotes: string;
  clientNotes: string;
}

export function initialContractForm(contract?: ContractDetail): ContractFormState {
  return {
    clientOrganizationId: contract?.clientOrganization.id ?? '',
    projectId: contract?.project?.id ?? '',
    type: contract?.type ?? CONTRACT_TYPE.SUPPORT_HOURS,
    title: contract?.title ?? '',
    scope: contract?.scope ?? '',
    status: contract?.status ?? CONTRACT_STATUS.DRAFT,
    startDate: contract?.startDate ?? todayIso(),
    endDate: contract?.endDate ?? '',
    renewalDate: contract?.renewalDate ?? '',
    autoRenew: contract?.autoRenew ?? false,
    currency: contract?.currency ?? 'INR',
    contractValue: contract?.contractValue ?? '',
    internalCost: contract?.internalCost ?? '',
    includedHours: contract ? String(contract.includedMinutesPerPeriod / 60) : '10',
    billingPeriod: contract?.billingPeriod ?? BILLING_PERIOD.MONTHLY,
    carryForwardRule: contract?.carryForwardRule ?? CARRY_FORWARD_RULE.NONE,
    carryForwardCapHours: contract?.carryForwardCapMinutes
      ? String(contract.carryForwardCapMinutes / 60)
      : '',
    lowHoursThresholdHours: contract ? String(contract.lowHoursThresholdMinutes / 60) : '5',
    internalNotes: contract?.internalNotes ?? '',
    clientNotes: contract?.clientNotes ?? '',
  };
}

/** Internal cost is only sent by people allowed to see it. */
export function toContractInput(form: ContractFormState, canSeeCost: boolean): ContractInput {
  return {
    clientOrganizationId: form.clientOrganizationId,
    projectId: form.projectId || null,
    type: form.type,
    title: form.title.trim(),
    scope: form.scope.trim() || null,
    status: form.status === CONTRACT_STATUS.ARCHIVED ? undefined : form.status,
    startDate: form.startDate,
    endDate: form.endDate || null,
    renewalDate: form.renewalDate || null,
    autoRenew: form.autoRenew,
    currency: form.currency.toUpperCase(),
    contractValue: form.contractValue || null,
    ...(canSeeCost ? { internalCost: form.internalCost || null } : {}),
    includedMinutesPerPeriod: Math.round(Number(form.includedHours || 0) * 60),
    billingPeriod: form.billingPeriod,
    carryForwardRule: form.carryForwardRule,
    carryForwardCapMinutes: form.carryForwardCapHours
      ? Math.round(Number(form.carryForwardCapHours) * 60)
      : null,
    lowHoursThresholdMinutes: Math.round(Number(form.lowHoursThresholdHours || 0) * 60),
    internalNotes: form.internalNotes.trim() || null,
    clientNotes: form.clientNotes.trim() || null,
  };
}
