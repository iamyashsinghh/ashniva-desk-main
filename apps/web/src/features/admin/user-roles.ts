import {
  ALL_ROLE_KEYS,
  CLIENT_ROLE_KEYS,
  PERMISSIONS,
  ROLE_KEYS,
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

export interface RoleTargetOrganization {
  isServiceProvider: boolean;
}

/**
 * Roles the API will actually accept for this actor + company.
 * Client companies cannot take Developer / Super Admin; Ashniva cannot take Client Admin.
 */
export function assignableRoleKeys(
  actorIsClient: boolean,
  target: RoleTargetOrganization,
): readonly RoleKey[] {
  if (actorIsClient) {
    return CLIENT_ROLE_KEYS;
  }
  if (target.isServiceProvider) {
    return ALL_ROLE_KEYS.filter((role) => !isClientRole(role));
  }
  return CLIENT_ROLE_KEYS;
}

export function defaultRoleChoice(
  actorIsClient: boolean,
  target: RoleTargetOrganization,
): string {
  const keys = assignableRoleKeys(actorIsClient, target);
  const preferred = actorIsClient || !target.isServiceProvider ? ROLE_KEYS.CLIENT_EMPLOYEE : ROLE_KEYS.DEVELOPER;
  const role = keys.includes(preferred) ? preferred : keys[0];
  return `key:${role}`;
}

/** System roles the caller may assign plus the organization's custom roles (when readable). */
export function useRoleChoices(
  organizationId: string,
  target: RoleTargetOrganization,
): RoleChoice[] {
  const me = useCurrentUser();
  const canReadRoles = usePermission(PERMISSIONS.ROLE_MANAGE);
  const roles = useCustomRolesQuery(organizationId, canReadRoles);
  const allowed = new Set(assignableRoleKeys(isClientRole(me.roleKey), target));
  const system = ALL_ROLE_KEYS.filter((role) => allowed.has(role)).map((role) => ({
    value: `key:${role}`,
    label: ROLE_LABELS[role],
  }));
  const custom = (roles.data ?? [])
    .filter((role) => !role.isSystem)
    .filter((role) => {
      const template = (role.templateKey ?? role.key) as RoleKey;
      return allowed.has(template);
    })
    .map((role) => ({ value: `id:${role.id}`, label: `${role.name} (custom)` }));
  return [...system, ...custom];
}

/** Turns a picker value back into the API's roleKey / roleId pair. */
export function roleBody(choice: string): { roleKey?: RoleKey; roleId?: string } {
  return choice.startsWith('id:')
    ? { roleId: choice.slice(3) }
    : { roleKey: choice.slice(4) as RoleKey };
}
