import type { DirectoryEntry, RoleKey } from '@ashniva/types';
import { Select } from '@ashniva/ui';

import { useDirectoryQuery } from '../../users/api';

interface PeoplePickerProps {
  id?: string;
  value: string;
  onChange: (userId: string) => void;
  /** Restrict to some roles (e.g. testers). Empty = everyone. */
  roles?: RoleKey[];
  placeholder?: string;
  'aria-describedby'?: string;
  invalid?: boolean;
  required?: boolean;
}

/** Select of internal people from the directory, optionally limited to roles. */
export function PeoplePicker({
  value,
  onChange,
  roles,
  placeholder = 'Unassigned',
  ...rest
}: PeoplePickerProps) {
  const directory = useDirectoryQuery();
  const people = (directory.data ?? []).filter((entry) => !roles || roles.includes(entry.roleKey));
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={[
        { value: '', label: placeholder },
        ...people.map((person) => ({ value: person.id, label: describe(person) })),
      ]}
      {...rest}
    />
  );
}

function describe(person: DirectoryEntry): string {
  const role = person.title ?? person.roleKey.replace(/_/g, ' ').toLowerCase();
  return `${person.name} · ${role}`;
}
