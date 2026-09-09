import type {
  CommentSummary,
  PaginatedResponse,
  Priority,
  TicketDetail,
  TicketListView,
  TicketStatus,
  TicketSummary,
  TicketType,
  Visibility,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface TicketListParams {
  view?: TicketListView;
  status?: TicketStatus[];
  projectId?: string;
  clientOrganizationId?: string;
  assignedToId?: string;
  priority?: Priority;
  type?: TicketType;
  /** Narrows any view to today's resolutions, matching the "Resolved today" dashboard card. */
  resolvedToday?: boolean;
  search?: string;
  limit?: number;
}

export const ticketKeys = {
  all: ['tickets'] as const,
  list: (params: TicketListParams) => ['tickets', 'list', params] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
};

export function useTicketsQuery(params: TicketListParams) {
  return useQuery({
    queryKey: ticketKeys.list(params),
    queryFn: () =>
      apiRequest<PaginatedResponse<TicketSummary>>('/tickets', {
        query: { ...params, status: params.status?.join(','), limit: params.limit ?? 100 },
      }),
  });
}

export function useTicketQuery(id: string | undefined) {
  return useQuery({
    queryKey: ticketKeys.detail(id ?? ''),
    queryFn: () => apiRequest<TicketDetail>(`/tickets/${id}`),
    enabled: Boolean(id),
  });
}

export interface CreateTicketInput {
  title: string;
  description: string;
  type?: TicketType;
  priority?: Priority;
  projectId?: string;
  module?: string;
  impact?: string;
  fileIds?: string[];
  clientOrganizationId?: string;
  requesterId?: string;
}

export interface ConvertTicketInput {
  projectId: string;
  priority?: Priority;
  clientVisible?: boolean;
  testerId?: string;
  tasks: Array<{ title: string; description?: string; assignedToId?: string; dueDate?: string }>;
}

export function useTicketMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    await queryClient.invalidateQueries({ queryKey: ['portal'] });
  };
  const useAction = <TBody>(action: string) =>
    useMutation({
      mutationFn: (body: TBody) =>
        apiRequest<TicketDetail>(`/tickets/${id}/${action}`, { method: 'POST', body }),
      onSuccess: invalidate,
    });

  return {
    create: useMutation({
      mutationFn: (body: CreateTicketInput) =>
        apiRequest<TicketDetail>('/tickets', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    assign: useAction<{
      assignedToId: string;
      priority?: Priority;
      type?: TicketType;
      note?: string;
    }>('assign'),
    start: useAction<{ note?: string }>('start'),
    waitClient: useAction<{ note?: string }>('wait-client'),
    resume: useAction<{ note?: string }>('resume'),
    review: useAction<{ note?: string }>('review'),
    resolve: useAction<{ resolution: string }>('resolve'),
    close: useAction<{ note?: string }>('close'),
    reopen: useAction<{ reason: string }>('reopen'),
    cancel: useAction<{ reason: string }>('cancel'),
    convert: useAction<ConvertTicketInput>('convert'),
    comment: useMutation({
      mutationFn: (body: { body: string; visibility: Visibility }) =>
        apiRequest<CommentSummary>(`/tickets/${id}/comments`, { method: 'POST', body }),
      onSuccess: invalidate,
    }),
  };
}
