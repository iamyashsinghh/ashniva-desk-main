import {
  BILLING_PERIOD,
  CARRY_FORWARD_RULE,
  CONTRACT_STATUS,
  CONTRACT_TYPE,
  type BillingPeriod,
  type CarryForwardRule,
  type ContractDetail,
  type ContractStatus,
  type ContractType,
} from '@ashniva/types';

import { todayIsoDate } from '../../shared/format/format';
import { HOURS_TYPES, hoursToMinutes, isAmount, minutesToHours } from './contract-display';

/**
 * The contract form's state and the body it sends, mirroring the web's `contract-form.ts`.
 *
 * Hours are typed in hours and sent in minutes. Money stays a decimal string end to end, so the
 * phone never rounds a contract value through a float.
 */

export interface ContractFormState {
  clientOrganizationId: string | null;
  projectId: string | null;
  type: ContractType;
  title: string;
  status: ContractStatus;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  currency: string;
  contractValue: string;
  internalCost: string;
  includedHours: string;
  billingPeriod: BillingPeriod;
  carryForwardRule: CarryForwardRule;
  carryForwardCapHours: string;
  lowHoursThresholdHours: string;
  scope: string;
  clientNotes: string;
  internalNotes: string;
}

export type ContractFormErrors = Partial<Record<keyof ContractFormState, string>>;

export function initialContractForm(contract: ContractDetail | null): ContractFormState {
  return {
    clientOrganizationId: contract?.clientOrganization.id ?? null,
    projectId: contract?.project?.id ?? null,
    type: contract?.type ?? CONTRACT_TYPE.SUPPORT_HOURS,
    title: contract?.title ?? '',
    status: contract?.status ?? CONTRACT_STATUS.DRAFT,
    startDate: contract?.startDate ?? todayIsoDate(),
    endDate: contract?.endDate ?? null,
    renewalDate: contract?.renewalDate ?? null,
    autoRenew: contract?.autoRenew ?? false,
    currency: contract?.currency ?? 'INR',
    contractValue: contract?.contractValue ?? '',
    internalCost: contract?.internalCost ?? '',
    includedHours: contract ? minutesToHours(contract.includedMinutesPerPeriod) : '10',
    billingPeriod: contract?.billingPeriod ?? BILLING_PERIOD.MONTHLY,
    carryForwardRule: contract?.carryForwardRule ?? CARRY_FORWARD_RULE.NONE,
    carryForwardCapHours: contract?.carryForwardCapMinutes
      ? minutesToHours(contract.carryForwardCapMinutes)
      : '',
    lowHoursThresholdHours: contract ? minutesToHours(contract.lowHoursThresholdMinutes) : '5',
    scope: contract?.scope ?? '',
    clientNotes: contract?.clientNotes ?? '',
    internalNotes: contract?.internalNotes ?? '',
  };
}

/** Whether the hour terms apply: an hours-type contract, or any contract with hours included. */
export function tracksHours(form: ContractFormState): boolean {
  return HOURS_TYPES.includes(form.type) || (hoursToMinutes(form.includedHours) ?? 0) > 0;
}

export function validateContractForm(form: ContractFormState): ContractFormErrors {
  const errors: ContractFormErrors = {};
  if (!form.clientOrganizationId) {
    errors.clientOrganizationId = 'Choose the client.';
  }
  if (form.title.trim().length < 3) {
    errors.title = 'At least three characters.';
  }
  if (!form.startDate) {
    errors.startDate = 'A contract needs a start date.';
  }
  if (form.endDate && form.startDate && form.endDate < form.startDate) {
    errors.endDate = 'The end date is before the start date.';
  }
  if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) {
    errors.currency = 'A three-letter currency code, like INR.';
  }
  if (form.contractValue.trim() && !isAmount(form.contractValue)) {
    errors.contractValue = 'A number with at most two decimals.';
  }
  if (form.internalCost.trim() && !isAmount(form.internalCost)) {
    errors.internalCost = 'A number with at most two decimals.';
  }
  const included = hoursToMinutes(form.includedHours);
  if (form.includedHours.trim() && (included === null || included < 0)) {
    errors.includedHours = 'A number of hours, zero or more.';
  }
  const low = hoursToMinutes(form.lowHoursThresholdHours);
  if (form.lowHoursThresholdHours.trim() && (low === null || low < 0)) {
    errors.lowHoursThresholdHours = 'A number of hours, zero or more.';
  }
  const cap = hoursToMinutes(form.carryForwardCapHours);
  if (form.carryForwardCapHours.trim() && (cap === null || cap < 0)) {
    errors.carryForwardCapHours = 'A number of hours, zero or more.';
  }
  return errors;
}

/**
 * The request body. The client of an existing contract cannot be changed, so it is only sent on
 * create; internal cost is only sent by somebody allowed to see it, so a save by anyone else never
 * blanks a figure they were not shown.
 */
export function contractPayload(
  form: ContractFormState,
  options: { editing: boolean; canSeeCost: boolean },
): Record<string, unknown> {
  return {
    ...(options.editing ? {} : { clientOrganizationId: form.clientOrganizationId }),
    projectId: form.projectId,
    type: form.type,
    title: form.title.trim(),
    ...(form.status === CONTRACT_STATUS.ARCHIVED ? {} : { status: form.status }),
    startDate: form.startDate,
    endDate: form.endDate,
    renewalDate: form.renewalDate,
    autoRenew: form.autoRenew,
    currency: form.currency.trim().toUpperCase(),
    contractValue: form.contractValue.trim() || null,
    ...(options.canSeeCost ? { internalCost: form.internalCost.trim() || null } : {}),
    includedMinutesPerPeriod: hoursToMinutes(form.includedHours) ?? 0,
    billingPeriod: form.billingPeriod,
    carryForwardRule: form.carryForwardRule,
    carryForwardCapMinutes:
      form.carryForwardRule === CARRY_FORWARD_RULE.CAPPED
        ? hoursToMinutes(form.carryForwardCapHours)
        : null,
    lowHoursThresholdMinutes: hoursToMinutes(form.lowHoursThresholdHours) ?? 0,
    scope: form.scope.trim() || null,
    clientNotes: form.clientNotes.trim() || null,
    internalNotes: form.internalNotes.trim() || null,
  };
}
