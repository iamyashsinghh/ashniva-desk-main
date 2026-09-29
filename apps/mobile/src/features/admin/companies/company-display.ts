import {
  ORGANIZATION_TYPE,
  ORGANIZATION_TYPE_LABELS,
  type OrganizationSummary,
  type OrganizationType,
} from '@ashniva/types';

import type { IconTone } from '../../../shared/components/Icon';

export const ORGANIZATION_TYPES = Object.values(ORGANIZATION_TYPE) as OrganizationType[];

export const COMPANIES_KEY = ['organizations', 'directory'] as const;
export const companyKey = (id: string) => ['organizations', 'detail', id] as const;

export function organizationTypeLabel(type: OrganizationType): string {
  return ORGANIZATION_TYPE_LABELS[type];
}

export function companyTone(organization: OrganizationSummary): IconTone {
  return organization.isServiceProvider ? 'primary' : 'teal';
}

/** Name or slug, case-blind; the list is small enough to filter on the phone, as the web does. */
export function filterCompanies(
  organizations: readonly OrganizationSummary[],
  search: string,
  type: OrganizationType | null,
): OrganizationSummary[] {
  const term = search.trim().toLowerCase();
  return organizations.filter(
    (organization) =>
      (!type || organization.type === type) &&
      (!term ||
        organization.name.toLowerCase().includes(term) ||
        organization.slug.toLowerCase().includes(term)),
  );
}

export function countsLine(organization: OrganizationSummary): string {
  const people = `${organization.userCount} ${organization.userCount === 1 ? 'person' : 'people'}`;
  return `${people} · ${organization.projectCount} projects · ${organization.openTicketCount} open tickets`;
}
