import {
  ALL_ROLE_KEYS,
  CLIENT_ROLE_KEYS,
  PERMISSIONS,
  ROLE_KEYS,
  ROLE_LABELS,
  isClientRole,
  type RoleKey,
  type UserSummary,
} from '@ashniva/types';
import { useMemo } from 'react';

import type { SelectOption } from '../../../shared/components/SelectSheet';
import { useSession } from '../../auth/SessionProvider';
import { useRoles } from '../roles/roles-api';

/**
 * Which roles a person can be given, as the web's `user-roles.ts` works it out.
 *
 * A choice is `key:DEVELOPER` for a system role and `id:<uuid>` for a custom one, because the API
 * takes either a `roleKey` or a `roleId` and a picker needs one string per option. The API is the
 * authority — it refuses escalation and the wrong audience — and this list exists so the picker
 * never offers a role that would be refused.
 */

export type RoleChoice = string;

/** A client company cannot hold Developer or Super Admin; the provider cannot hold Client Admin. */
export function assignableRoleKeys(
  actorIsClient: boolean,
  targetIsServiceProvider: boolean,
): readonly RoleKey[] {
  if (actorIsClient || !targetIsServiceProvider) {
    return CLIENT_ROLE_KEYS;
  }
  return ALL_ROLE_KEYS.filter((role) => !isClientRole(role));
}

export function defaultRoleChoice(
  actorIsClient: boolean,
  targetIsServiceProvider: boolean,
): RoleChoice {
  const keys = assignableRoleKeys(actorIsClient, targetIsServiceProvider);
  const preferred =
    actorIsClient || !targetIsServiceProvider ? ROLE_KEYS.CLIENT_EMPLOYEE : ROLE_KEYS.DEVELOPER;
  return `key:${keys.includes(preferred) ? preferred : keys[0]}`;
}

/** Turns a picker value back into the API's `roleKey` / `roleId` pair. */
export function roleBody(choice: RoleChoice): { roleKey?: RoleKey; roleId?: string } {
  return choice.startsWith('id:')
    ? { roleId: choice.slice(3) }
    : { roleKey: choice.slice(4) as RoleKey };
}

/** The person's current role as a choice: their custom role when they have one. */
export function currentRoleChoice(user: Pick<UserSummary, 'isCustomRole' | 'roleId' | 'roleKey'>) {
  return user.isCustomRole ? `id:${user.roleId}` : `key:${user.roleKey}`;
}

/**
 * System roles the caller may assign plus the company's custom roles built on one of them.
 *
 * Custom roles are only listed with `role:manage`, which is what reading them takes; without it
 * the picker offers the system roles, as on the web.
 */
export function useRoleChoices(
  scope: string | undefined,
  targetIsServiceProvider: boolean,
): { options: SelectOption[]; loading: boolean } {
  const { user, can } = useSession();
  const canReadRoles = can(PERMISSIONS.ROLE_MANAGE);
  const roles = useRoles(scope, canReadRoles);
  const actorIsClient = user ? isClientRole(user.roleKey) : true;

  const options = useMemo(() => {
    const allowed = new Set(assignableRoleKeys(actorIsClient, targetIsServiceProvider));
    const system: SelectOption[] = ALL_ROLE_KEYS.filter((role) => allowed.has(role)).map(
      (role) => ({
        value: `key:${role}`,
        label: ROLE_LABELS[role],
        icon: 'shield-outline',
        iconTone: 'neutral',
      }),
    );
    const custom: SelectOption[] = (roles.data ?? [])
      .filter((role) => !role.isSystem)
      .filter((role) => allowed.has((role.templateKey ?? role.key) as RoleKey))
      .map((role) => ({
        value: `id:${role.id}`,
        label: role.name,
        description: `Custom role${role.templateKey ? ` · from ${ROLE_LABELS[role.templateKey]}` : ''}`,
        icon: 'shield-checkmark-outline',
        iconTone: 'violet',
      }));
    return [...system, ...custom];
  }, [actorIsClient, targetIsServiceProvider, roles.data]);

  return { options, loading: canReadRoles && roles.isLoading };
}
