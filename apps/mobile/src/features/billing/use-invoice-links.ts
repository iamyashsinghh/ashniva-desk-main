import {
  PERMISSIONS,
  type ContractSummary,
  type PaginatedResponse,
  type ProjectSummary,
} from '@ashniva/types';
import { useMemo } from 'react';

import { useResource } from '../../shared/api/queries';
import type { SelectOption } from '../../shared/components/SelectSheet';
import { useSession } from '../auth/SessionProvider';

/**
 * What an invoice for the chosen client can be raised against: that client's projects and
 * contracts. Each list is only asked for when the person may read it, so a billing clerk without
 * `contract:read` gets no picker rather than a 403.
 */
export function useInvoiceLinks(clientId: string) {
  const { can } = useSession();
  const readProjects = can(PERMISSIONS.PROJECT_READ);
  const readContracts = can(PERMISSIONS.CONTRACT_READ);

  // The same key the shared project picker uses, so the list is fetched once for the app.
  const projects = useResource<ProjectSummary[]>(['projects'], '/projects', {
    enabled: readProjects,
  });
  const contracts = useResource<PaginatedResponse<ContractSummary>>(
    ['billing', 'contracts', clientId],
    '/contracts',
    {
      enabled: readContracts && clientId.length > 0,
      query: { clientOrganizationId: clientId, view: 'all', limit: 100 },
    },
  );

  const projectOptions = useMemo<SelectOption[]>(
    () =>
      (projects.data ?? [])
        .filter((project) => project.clientOrganization?.id === clientId)
        .map((project) => ({
          value: project.id,
          label: project.name,
          description: project.code,
          icon: 'folder-open-outline',
          iconTone: 'teal',
        })),
    [projects.data, clientId],
  );
  const contractOptions = useMemo<SelectOption[]>(
    () =>
      (contracts.data?.items ?? []).map((contract) => ({
        value: contract.id,
        label: `${contract.number} · ${contract.title}`,
        description: contract.project?.name ?? undefined,
        icon: 'document-text-outline',
        iconTone: 'violet',
      })),
    [contracts.data],
  );

  return {
    readProjects,
    readContracts,
    projectOptions,
    contractOptions,
    projectsLoading: projects.isLoading,
    contractsLoading: contracts.isLoading,
  };
}
