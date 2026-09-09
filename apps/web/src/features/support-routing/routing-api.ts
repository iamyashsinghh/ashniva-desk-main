import type { TicketRoutingDetail, UnassignedTicketSummary } from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const routingKeys = {
  all: ['ticket-routing'] as const,
  detail: (ticketId: string) => ['ticket-routing', 'detail', ticketId] as const,
  queue: ['ticket-routing', 'queue'] as const,
};

export function useTicketRoutingQuery(ticketId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: routingKeys.detail(ticketId ?? ''),
    queryFn: () => apiRequest<TicketRoutingDetail>(`/tickets/${ticketId}/routing`),
    enabled: enabled && Boolean(ticketId),
  });
}

export function useSupportQueueQuery(enabled = true) {
  return useQuery({
    queryKey: routingKeys.queue,
    queryFn: () => apiRequest<UnassignedTicketSummary[]>('/tickets/queue/unassigned'),
    enabled,
  });
}

export function useRoutingMutations(ticketId: string | undefined) {
  const client = useQueryClient();
  // Every one of these changes the ticket itself as well as its routing, so both caches go.
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: routingKeys.all });
    await client.invalidateQueries({ queryKey: ['tickets'] });
  };
  const settle = async (detail: TicketRoutingDetail) => {
    client.setQueryData(routingKeys.detail(ticketId ?? ''), detail);
    await refresh();
  };

  return {
    acknowledge: useMutation({
      mutationFn: () =>
        apiRequest<TicketRoutingDetail>(`/tickets/${ticketId}/acknowledge`, { method: 'POST' }),
      onSuccess: settle,
    }),
    reassign: useMutation({
      mutationFn: (input: { assignedToId: string; reason: string }) =>
        apiRequest<TicketRoutingDetail>(`/tickets/${ticketId}/reassign`, {
          method: 'POST',
          body: input,
        }),
      onSuccess: settle,
    }),
    reroute: useMutation({
      mutationFn: (force: boolean) =>
        apiRequest<TicketRoutingDetail>(`/tickets/${ticketId}/route`, {
          method: 'POST',
          body: { force },
        }),
      onSuccess: settle,
    }),
  };
}
