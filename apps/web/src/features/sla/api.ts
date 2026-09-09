import type { Priority, SlaEventSummary, SlaPolicySummary, TicketStatus } from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const slaKeys = {
  policies: ['sla', 'policies'] as const,
  events: (ticketId: string) => ['sla', 'events', ticketId] as const,
};

export function useSlaPoliciesQuery(enabled = true) {
  return useQuery({
    queryKey: slaKeys.policies,
    queryFn: () => apiRequest<SlaPolicySummary[]>('/sla/policies'),
    enabled,
  });
}

export function useTicketSlaEventsQuery(ticketId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: slaKeys.events(ticketId ?? ''),
    queryFn: () => apiRequest<SlaEventSummary[]>(`/sla/tickets/${ticketId}/events`),
    enabled: Boolean(ticketId) && enabled,
  });
}

export interface SlaPolicyInput {
  name: string;
  description?: string | null;
  clientOrganizationId?: string | null;
  projectId?: string | null;
  isDefault?: boolean;
  timezone?: string;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  businessDays?: number[];
  pauseStatuses?: TicketStatus[];
  warningPercent?: number;
  rules: Array<{ priority: Priority; firstResponseMinutes: number; resolutionMinutes: number }>;
}

/** Policy writes re-apply targets to open tickets, so ticket queries are refreshed too. */
export function useSlaPolicyMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['sla'] });
    await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  return {
    create: useMutation({
      mutationFn: (body: SlaPolicyInput) =>
        apiRequest<SlaPolicySummary>('/sla/policies', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (body: Partial<SlaPolicyInput>) =>
        apiRequest<SlaPolicySummary>(`/sla/policies/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: () => apiRequest<void>(`/sla/policies/${id}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
  };
}
