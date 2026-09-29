import type { OrganizationOption, TeamSummary } from '@ashniva/types';
import { useMemo } from 'react';

import { useResource } from '../../shared/api/queries';
import type { SelectOption } from '../../shared/components/SelectSheet';

/**
 * The two lists the project form picks from that are not people.
 *
 * Clients are `GET /organizations/options` without the service provider itself — a project for
 * our own company is an internal one, which is "no client". Teams are `GET /teams`, which the API
 * opens to anyone who may manage projects.
 */

export function useClientOptions() {
  const organizations = useResource<OrganizationOption[]>(
    ['organizations', 'options'],
    '/organizations/options',
  );
  const options = useMemo<SelectOption[]>(
    () =>
      (organizations.data ?? [])
        .filter((organization) => !organization.isServiceProvider)
        .map((organization) => ({
          value: organization.id,
          label: organization.name,
          icon: 'business-outline',
          iconTone: 'teal',
        })),
    [organizations.data],
  );
  return { options, isLoading: organizations.isLoading };
}

export function useTeamOptions() {
  const teams = useResource<TeamSummary[]>(['teams'], '/teams');
  const options = useMemo<SelectOption[]>(
    () =>
      (teams.data ?? []).map((team) => ({
        value: team.id,
        label: team.name,
        description: `${team.members.length} people${team.lead ? ` · led by ${team.lead.name}` : ''}`,
        icon: 'people-outline',
        iconTone: 'violet',
      })),
    [teams.data],
  );
  return { options, isLoading: teams.isLoading };
}
