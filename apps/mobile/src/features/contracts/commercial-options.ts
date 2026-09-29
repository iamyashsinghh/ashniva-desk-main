import {
  PERMISSIONS,
  type ContractSummary,
  type OrganizationOption,
  type PaginatedResponse,
  type ProjectSummary,
  type UserSummary,
} from '@ashniva/types';
import { useMemo } from 'react';

import { useResource } from '../../shared/api/queries';
import type { SelectOption } from '../../shared/components/SelectSheet';
import { useSession } from '../auth/SessionProvider';

/**
 * The lists the contract, change-request and milestone forms pick from.
 *
 * Each one is asked for only by somebody the API will answer, because a 403 behind a picker reads
 * as an empty list rather than as "not for you". The keys match the ones the other forms use, so
 * a screen that already fetched the projects does not fetch them again.
 */

/** Client companies — never the provider itself, which is not somebody's client. */
export function useClientOptions(enabled = true) {
  const { can } = useSession();
  const allowed = can(PERMISSIONS.PROJECT_READ) || can(PERMISSIONS.TICKET_RAISE);
  const organizations = useResource<OrganizationOption[]>(
    ['organizations', 'options'],
    '/organizations/options',
    { enabled: enabled && allowed },
  );
  const options = useMemo<SelectOption[]>(
    () =>
      (organizations.data ?? [])
        .filter((organization) => !organization.isServiceProvider)
        .map((organization) => ({
          value: organization.id,
          label: organization.name,
          icon: 'business-outline',
          iconTone: 'violet',
        })),
    [organizations.data],
  );
  return { options, isLoading: organizations.isLoading };
}

/** Projects, narrowed to one client when one is chosen. */
export function useClientProjectOptions(clientOrganizationId: string | null, enabled = true) {
  const { can } = useSession();
  const projects = useResource<ProjectSummary[]>(['projects'], '/projects', {
    enabled: enabled && can(PERMISSIONS.PROJECT_READ),
  });
  const options = useMemo<SelectOption[]>(
    () =>
      (projects.data ?? [])
        .filter(
          (project) =>
            !clientOrganizationId || project.clientOrganization?.id === clientOrganizationId,
        )
        .map((project) => ({
          value: project.id,
          label: project.name,
          description: project.clientOrganization?.name ?? project.code,
          icon: 'folder-open-outline',
          iconTone: 'teal',
        })),
    [projects.data, clientOrganizationId],
  );
  return { options, isLoading: projects.isLoading };
}

/** One client's contracts, whatever state they are in, for linking a change or a milestone. */
export function useClientContractOptions(clientOrganizationId: string | null) {
  const { can } = useSession();
  const query = { view: 'all', limit: 100, clientOrganizationId: clientOrganizationId ?? '' };
  const contracts = useResource<PaginatedResponse<ContractSummary>>(
    ['contracts', 'options', clientOrganizationId],
    '/contracts',
    { enabled: Boolean(clientOrganizationId) && can(PERMISSIONS.CONTRACT_READ), query },
  );
  const options = useMemo<SelectOption[]>(
    () =>
      (contracts.data?.items ?? []).map((contract) => ({
        value: contract.id,
        label: `${contract.number} ${contract.title}`,
        icon: 'document-text-outline',
        iconTone: 'info',
      })),
    [contracts.data],
  );
  return { options, isLoading: contracts.isLoading };
}

/**
 * A client's people, for "requested by". `GET /users` is an administration read (`user:manage`),
 * so anyone without it raises the request as themselves, which is what the API does by default.
 */
export function useClientContactOptions(clientOrganizationId: string | null) {
  const { can } = useSession();
  const allowed = can(PERMISSIONS.USER_MANAGE);
  const users = useResource<UserSummary[]>(
    ['users', 'by-organization', clientOrganizationId],
    '/users',
    {
      enabled: allowed && Boolean(clientOrganizationId),
      query: { organizationId: clientOrganizationId ?? '' },
    },
  );
  const options = useMemo<SelectOption[]>(
    () =>
      (users.data ?? []).map((person) => ({
        value: person.id,
        label: person.name,
        description: person.email,
        icon: 'person-circle-outline',
        iconTone: 'info',
      })),
    [users.data],
  );
  return { options, isLoading: users.isLoading, allowed };
}
