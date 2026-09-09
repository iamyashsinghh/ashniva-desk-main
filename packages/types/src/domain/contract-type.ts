export const CONTRACT_TYPE = {
  FIXED_PRICE: 'FIXED_PRICE',
  RETAINER: 'RETAINER',
  AMC: 'AMC',
  SUPPORT_HOURS: 'SUPPORT_HOURS',
  DEDICATED_DEV: 'DEDICATED_DEV',
} as const;

export type ContractType = (typeof CONTRACT_TYPE)[keyof typeof CONTRACT_TYPE];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  FIXED_PRICE: 'Fixed price',
  RETAINER: 'Monthly retainer',
  AMC: 'Annual maintenance contract',
  SUPPORT_HOURS: 'Support hours',
  DEDICATED_DEV: 'Dedicated developer',
};
