export const ORGANIZATION_TYPE = {
  OWN_GROUP: 'OWN_GROUP',
  CORPORATE_CUSTOMER: 'CORPORATE_CUSTOMER',
  CONTRACT_CLIENT: 'CONTRACT_CLIENT',
  AMC_CLIENT: 'AMC_CLIENT',
} as const;

export type OrganizationType = (typeof ORGANIZATION_TYPE)[keyof typeof ORGANIZATION_TYPE];

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  OWN_GROUP: 'Own group company',
  CORPORATE_CUSTOMER: 'Corporate customer',
  CONTRACT_CLIENT: 'Contract client',
  AMC_CLIENT: 'AMC / support client',
};
