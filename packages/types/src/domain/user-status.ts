export const USER_STATUS = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
