import type { OrganizationOption, PortalProjectSummary, ProjectSummary } from '@ashniva/types';
import { useMemo } from 'react';

import { useResource } from '../../shared/api/queries';
import type { SelectOption } from '../../shared/components/SelectSheet';

/**
 * The lists a ticket form or filter picks from.
 *
 * Projects come from whichever door this person is allowed through: a client reads the portal's
 * list of their own projects, staff read `/projects`. Asking the other one would be a 403 — and
 * for a client, a list of other clients' projects is exactly what must never arrive.
 */

export interface TicketProjectOption extends SelectOption {
  /** The client the project belongs to, so a form can narrow the list to one company. */
  clientOrganizationId: string | null;
}

export function useTicketProjectOptions(client: boolean, enabled: boolean) {
  const internal = useResource<ProjectSummary[]>(['projects'], '/projects', {
    enabled: enabled && !client,
  });
  const portal = useResource<PortalProjectSummary[]>(['portal', 'projects'], '/portal/projects', {
    enabled: enabled && client,
  });

  const options = useMemo<TicketProjectOption[]>(() => {
    if (client) {
      return (portal.data ?? []).map((project) => ({
        value: project.id,
        label: project.name,
        description: project.code,
        icon: 'folder-open-outline',
        iconTone: 'teal',
        clientOrganizationId: null,
      }));
    }
    return (internal.data ?? []).map((project) => ({
      value: project.id,
      label: project.name,
      description: project.clientOrganization?.name ?? project.code,
      icon: 'folder-open-outline',
      iconTone: 'teal',
      clientOrganizationId: project.clientOrganization?.id ?? null,
    }));
  }, [client, internal.data, portal.data]);

  return { options, isLoading: client ? portal.isLoading : internal.isLoading };
}

/** Client companies, for staff filtering the desk or raising a ticket on somebody's behalf. */
export function useCompanyOptions(enabled: boolean) {
  const organizations = useResource<OrganizationOption[]>(
    ['organizations', 'options'],
    '/organizations/options',
    { enabled },
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
