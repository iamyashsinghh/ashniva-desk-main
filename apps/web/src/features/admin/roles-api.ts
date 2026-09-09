import type {
  CustomRoleDetail,
  PermissionCatalogEntry,
  PermissionKey,
  RoleChangeHistoryEntry,
  RoleKey,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const roleKeys = {
  list: (organizationId?: string) => ['roles', 'custom', organizationId ?? 'own'] as const,
  catalog: ['roles', 'catalog'] as const,
  history: (id: string) => ['roles', 'history', id] as const,
};

/** System roles plus the custom roles of one organization, with their permissions. */
export function useCustomRolesQuery(organizationId?: string, enabled = true) {
  return useQuery({
    queryKey: roleKeys.list(organizationId),
    queryFn: () => apiRequest<CustomRoleDetail[]>('/roles', { query: { organizationId } }),
    enabled,
  });
}

export function usePermissionCatalogQuery() {
  return useQuery({
    queryKey: roleKeys.catalog,
    queryFn: () => apiRequest<PermissionCatalogEntry[]>('/roles/permissions'),
    staleTime: 10 * 60_000,
  });
}

export function useRoleHistoryQuery(id: string | undefined) {
  return useQuery({
    queryKey: roleKeys.history(id ?? ''),
    queryFn: () => apiRequest<RoleChangeHistoryEntry[]>(`/roles/${id}/history`),
    enabled: Boolean(id),
  });
}

export interface RoleInput {
  name: string;
  description?: string | null;
  templateKey?: RoleKey;
  permissions?: PermissionKey[];
  organizationId?: string;
}

/** Every write is a permission change, so each call carries the re-auth headers. */
export function useRoleMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['roles'] });
    await queryClient.invalidateQueries({ queryKey: ['users'] });
  };
  type WithHeaders<T> = T & { headers: Record<string, string> };
  return {
    create: useMutation({
      mutationFn: ({ headers, ...body }: WithHeaders<RoleInput>) =>
        apiRequest<CustomRoleDetail>('/roles', { method: 'POST', body, headers }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ headers, ...body }: WithHeaders<Partial<RoleInput>>) =>
        apiRequest<CustomRoleDetail>(`/roles/${id}`, { method: 'PATCH', body, headers }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: ({ headers }: { headers: Record<string, string> }) =>
        apiRequest<void>(`/roles/${id}`, { method: 'DELETE', headers }),
      onSuccess: invalidate,
    }),
  };
}
