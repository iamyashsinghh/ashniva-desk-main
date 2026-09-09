import type {
  CreateTicketRelationInput,
  TicketRelationCandidatesResponse,
  TicketRelationsResponse,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const relationKeys = {
  all: ['relations'] as const,
  ticket: (ticketId: string) => ['relations', 'ticket', ticketId] as const,
  candidates: (ticketId: string) => ['relations', 'candidates', ticketId] as const,
};

export function useTicketRelationsQuery(ticketId: string, enabled = true) {
  return useQuery({
    queryKey: relationKeys.ticket(ticketId),
    queryFn: () => apiRequest<TicketRelationsResponse>(`/tickets/${ticketId}/relations`),
    enabled: enabled && Boolean(ticketId),
  });
}

/**
 * Likely duplicates, fetched only when the dialog is open and only for a caller who may link.
 *
 * The endpoint needs `ticket:triage`; asking for it without that permission would answer 403 on a
 * screen that has nothing to do with it.
 */
export function useTicketRelationCandidatesQuery(ticketId: string, enabled: boolean) {
  return useQuery({
    queryKey: relationKeys.candidates(ticketId),
    queryFn: () =>
      apiRequest<TicketRelationCandidatesResponse>(`/tickets/${ticketId}/relations/candidates`),
    enabled: enabled && Boolean(ticketId),
  });
}

export function useTicketRelationMutations(ticketId: string) {
  const queryClient = useQueryClient();
  // Linking a duplicate can close a ticket, so the ticket itself and every list it appears on are
  // as stale as the relations panel.
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: relationKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    await queryClient.invalidateQueries({ queryKey: ['portal'] });
  };
  return {
    link: useMutation({
      mutationFn: (body: CreateTicketRelationInput) =>
        apiRequest<TicketRelationsResponse>(`/tickets/${ticketId}/relations`, {
          method: 'POST',
          body,
        }),
      onSuccess: invalidate,
    }),
    unlink: useMutation({
      mutationFn: (relationId: string) =>
        apiRequest<TicketRelationsResponse>(`/tickets/${ticketId}/relations/${relationId}`, {
          method: 'DELETE',
        }),
      onSuccess: invalidate,
    }),
  };
}
