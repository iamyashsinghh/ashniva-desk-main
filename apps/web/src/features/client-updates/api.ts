import type { ClientUpdateStatus, ClientUpdateSummary } from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface ClientUpdateParams {
  status?: ClientUpdateStatus;
  date?: string;
  projectId?: string;
  clientOrganizationId?: string;
}

export const clientUpdateKeys = {
  all: ['client-updates'] as const,
  list: (params: ClientUpdateParams) => ['client-updates', params] as const,
};

export function useClientUpdatesQuery(params: ClientUpdateParams) {
  return useQuery({
    queryKey: clientUpdateKeys.list(params),
    queryFn: () => apiRequest<ClientUpdateSummary[]>('/client-updates', { query: { ...params } }),
  });
}

export function useClientUpdateMutations() {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: clientUpdateKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };
  return {
    publish: useMutation({
      mutationFn: (id: string) =>
        apiRequest<ClientUpdateSummary>(`/client-updates/${id}/publish`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    withdraw: useMutation({
      mutationFn: (id: string) =>
        apiRequest<ClientUpdateSummary>(`/client-updates/${id}/withdraw`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    edit: useMutation({
      mutationFn: ({ id, ...body }: { id: string; title?: string; body?: string }) =>
        apiRequest<ClientUpdateSummary>(`/client-updates/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
  };
}
