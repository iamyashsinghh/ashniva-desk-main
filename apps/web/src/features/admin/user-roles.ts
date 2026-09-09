import {
  ALL_ROLE_KEYS,
  PERMISSIONS,
  ROLE_LABELS,
  isClientRole,
  type RoleKey,
} from '@ashniva/types';

import { useCurrentUser, usePermission } from '../auth/session-context';
import { useCustomRolesQuery } from './roles-api';

export interface RoleChoice {
  /** "key:DEVELOPER" for a system role, "id:<uuid>" for a custom role. */
  value: string;
  label: string;
}

/** System roles the caller may assign plus the organization's custom roles (when readable). */
export function useRoleChoices(organizationId: string): RoleChoice[] {
  const me = useCurrentUser();
  const canReadRoles = usePermission(PERMISSIONS.ROLE_MANAGE);
  const roles = useCustomRolesQuery(organizationId, canReadRoles);
  const clientOnly = isClientRole(me.roleKey);
  const system = ALL_ROLE_KEYS.filter((role) => !clientOnly || isClientRole(role)).map((role) => ({
    value: `key:${role}`,
    label: ROLE_LABELS[role],
  }));
  const custom = (roles.data ?? [])
    .filter((role) => !role.isSystem)
    .map((role) => ({ value: `id:${role.id}`, label: `${role.name} (custom)` }));
  return [...system, ...custom];
}

/** Turns a picker value back into the API's roleKey / roleId pair. */
export function roleBody(choice: string): { roleKey?: RoleKey; roleId?: string } {
  return choice.startsWith('id:')
    ? { roleId: choice.slice(3) }
    : { roleKey: choice.slice(4) as RoleKey };
}
