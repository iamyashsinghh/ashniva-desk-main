import type { RoleKey, TeamSummary, UserStatus, UserSummary } from '@ashniva/types';

import { useResource } from '../../../shared/api/queries';

/**
 * Reads for Users & teams.
 *
 * Every key starts with `users` or `teams`, so one invalidation after a write refreshes the list,
 * the person and the assignee pickers elsewhere in the app (`['users', 'directory']`) together.
 */

/** What a write to a person makes stale: people, the teams they are in, the company counts. */
export const USER_WRITES = [['users'], ['teams'], ['organizations']] as const;

export interface UserFilters {
  search?: string;
  status?: UserStatus;
  roleKey?: RoleKey;
}

export function useUsers(scope: string | undefined, filters: UserFilters = {}, enabled = true) {
  return useResource<UserSummary[]>(['users', 'list', scope ?? 'own', filters], '/users', {
    enabled,
    query: { organizationId: scope, ...filters },
  });
}

export function useUser(id: string, scope: string | undefined, enabled = true) {
  return useResource<UserSummary>(['users', 'detail', id, scope ?? 'own'], `/users/${id}`, {
    enabled,
    query: { organizationId: scope },
  });
}

/** Teams belong to the signed-in person's organization; the API has no per-company teams. */
export function useTeams(enabled = true) {
  return useResource<TeamSummary[]>(['teams'], '/teams', { enabled });
}
