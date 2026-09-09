import type { Prisma } from '../../generated/prisma/client';
import type { UpdateContractDto } from './dto/contract.dto';

export function toDateOrNull(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === null ? null : new Date(value);
}

/** Turns a PATCH body into the Prisma update: only fields that were sent, trimmed, nulls kept. */
export function contractPatchData(dto: UpdateContractDto): Prisma.ContractUncheckedUpdateInput {
  const data: Prisma.ContractUncheckedUpdateInput = {};
  const assign = <K extends keyof Prisma.ContractUncheckedUpdateInput>(
    key: K,
    value: Prisma.ContractUncheckedUpdateInput[K],
  ) => {
    if (value !== undefined) {
      data[key] = value;
    }
  };
  const text = (value: string | null | undefined) =>
    value === undefined ? undefined : value?.trim() || null;
  assign('projectId', dto.projectId);
  assign('type', dto.type);
  assign('title', dto.title?.trim());
  assign('description', text(dto.description));
  assign('scope', text(dto.scope));
  assign('status', dto.status);
  assign('startDate', dto.startDate ? new Date(dto.startDate) : undefined);
  assign('endDate', toDateOrNull(dto.endDate));
  assign('renewalDate', toDateOrNull(dto.renewalDate));
  assign('renewalNoticeDays', dto.renewalNoticeDays);
  assign('autoRenew', dto.autoRenew);
  assign('currency', dto.currency?.toUpperCase());
  assign('contractValue', dto.contractValue);
  assign('internalCost', dto.internalCost);
  assign('includedMinutesPerPeriod', dto.includedMinutesPerPeriod);
  assign('billingPeriod', dto.billingPeriod);
  assign('carryForwardRule', dto.carryForwardRule);
  assign('carryForwardCapMinutes', dto.carryForwardCapMinutes);
  assign('lowHoursThresholdMinutes', dto.lowHoursThresholdMinutes);
  assign('internalNotes', text(dto.internalNotes));
  assign('clientNotes', text(dto.clientNotes));
  return data;
}
