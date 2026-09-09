export const PROJECT_TYPE = {
  INTERNAL_PRODUCT: 'INTERNAL_PRODUCT',
  INTERNAL_WORK: 'INTERNAL_WORK',
  FIXED_PRICE: 'FIXED_PRICE',
  MONTHLY_CONTRACT: 'MONTHLY_CONTRACT',
  AMC: 'AMC',
  DEDICATED_DEV: 'DEDICATED_DEV',
  SUPPORT_ONLY: 'SUPPORT_ONLY',
} as const;

export type ProjectType = (typeof PROJECT_TYPE)[keyof typeof PROJECT_TYPE];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  INTERNAL_PRODUCT: 'Internal product development',
  INTERNAL_WORK: 'Work for our own company',
  FIXED_PRICE: 'Fixed-price client project',
  MONTHLY_CONTRACT: 'Monthly development contract',
  AMC: 'AMC / maintenance',
  DEDICATED_DEV: 'Dedicated developer contract',
  SUPPORT_ONLY: 'Support-only contract',
};
