import type {
  CustomRoleDetail,
  PermissionCatalogEntry,
  RoleChangeHistoryEntry,
} from '@ashniva/types';

import { useResource } from '../../../shared/api/queries';

/**
 * Reads for Roles & permissions. Every key starts with `roles`; a role write invalidates that and
 * `users`, because a person's role name and permissions come from here.
 */

export const ROLE_WRITES = [['roles'], ['users']] as const;

export const rolesKey = (scope: string | undefined) => ['roles', 'list', scope ?? 'own'] as const;

/** System roles plus the organization's custom roles, each with its permissions. */
export function useRoles(scope: string | undefined, enabled = true) {
  return useResource<CustomRoleDetail[]>(rolesKey(scope), '/roles', {
    enabled,
    query: { organizationId: scope },
  });
}

export function useRole(id: string, scope: string | undefined, enabled = true) {
  return useResource<CustomRoleDetail>(['roles', 'detail', id, scope ?? 'own'], `/roles/${id}`, {
    enabled,
    query: { organizationId: scope },
  });
}

/** The catalogue changes only with a deployment; one fetch serves every role opened. */
export function usePermissionCatalog(enabled = true) {
  return useResource<PermissionCatalogEntry[]>(['roles', 'catalog'], '/roles/permissions', {
    enabled,
  });
}

export function useRoleHistory(id: string) {
  return useResource<RoleChangeHistoryEntry[]>(['roles', 'history', id], `/roles/${id}/history`);
}
