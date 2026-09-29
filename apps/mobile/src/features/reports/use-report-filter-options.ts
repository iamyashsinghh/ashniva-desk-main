import { PERMISSIONS, type OrganizationOption } from '@ashniva/types';
import { useMemo } from 'react';

import { useResource } from '../../shared/api/queries';
import { directoryOptions, useDirectory, useProjectOptions } from '../../shared/components/pickers';
import type { SelectOption } from '../../shared/components/SelectSheet';
import { useSession } from '../auth/SessionProvider';

export interface ReportFilterOptions {
  /** Null when this person may not read the list, so the filter is not drawn at all. */
  clients: SelectOption[] | null;
  projects: SelectOption[] | null;
  people: SelectOption[] | null;
  loading: boolean;
}

/**
 * The pick-lists behind the report filters, each read only when the person may read it.
 *
 * The lists have their own permissions (`/projects` needs project:read, the company names need
 * project:read or ticket:raise, the roster task:read), and a report reader need not hold them.
 * A filter whose list would be refused is left out rather than drawn empty.
 */
export function useReportFilterOptions(): ReportFilterOptions {
  const { can } = useSession();
  const canProjects = can(PERMISSIONS.PROJECT_READ);
  const canClients = canProjects || can(PERMISSIONS.TICKET_RAISE);
  const canPeople = can(PERMISSIONS.TASK_READ);

  const organizations = useResource<OrganizationOption[]>(
    ['organizations', 'options'],
    '/organizations/options',
    { enabled: canClients },
  );
  const projects = useProjectOptions(canProjects);
  const directory = useDirectory(canPeople);

  const clients = useMemo<SelectOption[]>(
    () =>
      (organizations.data ?? [])
        .filter((org) => !org.isServiceProvider)
        .map((org) => ({
          value: org.id,
          label: org.name,
          icon: 'business-outline',
          iconTone: 'violet',
        })),
    [organizations.data],
  );
  const people = useMemo(() => directoryOptions(directory.data ?? []), [directory.data]);

  return {
    clients: canClients ? clients : null,
    projects: canProjects ? projects.options : null,
    people: canPeople ? people : null,
    loading: organizations.isLoading || projects.isLoading || directory.isLoading,
  };
}

/** The label of a chosen option, for the chip that shows a filter is on. */
export function optionLabel(options: SelectOption[] | null, value: string | undefined) {
  return options?.find((option) => option.value === value)?.label ?? null;
}
