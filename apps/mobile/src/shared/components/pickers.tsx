import { ROLE_LABELS, type DirectoryEntry, type ProjectSummary } from '@ashniva/types';
import { useMemo } from 'react';

import { useResource } from '../api/queries';
import { SelectField } from './SelectField';
import type { SelectOption } from './SelectSheet';

/**
 * Pickers for the two lists nearly every form needs: people and projects.
 *
 * The people list is `GET /users/directory` — the organization's assignable roster, not the
 * messaging directory, which answers a different question ("who may I talk to"). Both lists are
 * cached under stable keys so every form on screen shares one fetch.
 */

export const DIRECTORY_KEY = ['users', 'directory'] as const;

export function useDirectory(enabled = true) {
  return useResource<DirectoryEntry[]>(DIRECTORY_KEY, '/users/directory', { enabled });
}

export function directoryOptions(people: readonly DirectoryEntry[]): SelectOption[] {
  return people.map((person) => ({
    value: person.id,
    label: person.name,
    description: person.title ?? ROLE_LABELS[person.roleKey],
    icon: 'person-circle-outline',
    iconTone: 'info',
  }));
}

export function UserPicker({
  label,
  value,
  onChange,
  multiple = false,
  allowClear = true,
  placeholder = 'Unassigned',
  filter,
  hint,
  error,
  required,
  disabled,
}: {
  label: string;
  value: readonly string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  allowClear?: boolean;
  placeholder?: string;
  /** Narrows the roster, e.g. to testers only. */
  filter?: (person: DirectoryEntry) => boolean;
  hint?: string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
}) {
  const directory = useDirectory();
  const options = useMemo(
    () =>
      directoryOptions((directory.data ?? []).filter((person) => (filter ? filter(person) : true))),
    [directory.data, filter],
  );
  return (
    <SelectField
      label={label}
      icon="person-outline"
      options={options}
      value={value}
      onChange={onChange}
      multiple={multiple}
      allowClear={allowClear && !multiple}
      clearLabel={placeholder}
      placeholder={placeholder}
      loading={directory.isLoading}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      {...(required ? { required } : {})}
      {...(disabled ? { disabled } : {})}
    />
  );
}

export function useProjectOptions(enabled = true) {
  const projects = useResource<ProjectSummary[]>(['projects'], '/projects', { enabled });
  const options = useMemo<SelectOption[]>(
    () =>
      (projects.data ?? []).map((project) => ({
        value: project.id,
        label: project.name,
        description: project.clientOrganization?.name ?? project.code,
        icon: 'folder-open-outline',
        iconTone: 'teal',
      })),
    [projects.data],
  );
  return { options, isLoading: projects.isLoading };
}

export function ProjectPicker({
  label = 'Project',
  value,
  onChange,
  allowClear = false,
  placeholder = 'Choose a project',
  hint,
  error,
  required,
  disabled,
}: {
  label?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  allowClear?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
}) {
  const { options, isLoading } = useProjectOptions();
  return (
    <SelectField
      label={label}
      icon="folder-outline"
      options={options}
      value={value ? [value] : []}
      onChange={(ids) => onChange(ids[0] ?? null)}
      allowClear={allowClear}
      clearLabel="No project"
      placeholder={placeholder}
      loading={isLoading}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      {...(required ? { required } : {})}
      {...(disabled ? { disabled } : {})}
    />
  );
}
