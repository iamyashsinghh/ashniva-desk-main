import type {
  PortalClientUpdate,
  CommentSummary,
  FileSummary,
  PaginatedResponse,
  PortalHome,
  PortalProjectDetail,
  PortalProjectPlan,
  PortalProjectProgress,
  PortalProjectSummary,
  PortalTicketDetail,
  PortalTicketSummary,
  TicketListView,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';
import type { CreateTicketInput } from '../tickets/api';

export const portalKeys = {
  all: ['portal'] as const,
  home: ['portal', 'home'] as const,
  projects: ['portal', 'projects'] as const,
  project: (id: string) => ['portal', 'project', id] as const,
  progress: (id: string) => ['portal', 'project', id, 'progress'] as const,
  plan: (id: string) => ['portal', 'project', id, 'plan'] as const,
  tickets: (view: TicketListView) => ['portal', 'tickets', view] as const,
  ticket: (id: string) => ['portal', 'ticket', id] as const,
  updates: (from: string, to: string) => ['portal', 'updates', from, to] as const,
  files: ['portal', 'files'] as const,
};

export function usePortalHomeQuery() {
  return useQuery({
    queryKey: portalKeys.home,
    queryFn: () => apiRequest<PortalHome>('/portal/home'),
  });
}

export function usePortalProjectsQuery(enabled = true) {
  return useQuery({
    queryKey: portalKeys.projects,
    queryFn: () => apiRequest<PortalProjectSummary[]>('/portal/projects'),
    enabled,
  });
}

export function usePortalProjectQuery(id: string | undefined) {
  return useQuery({
    queryKey: portalKeys.project(id ?? ''),
    queryFn: () => apiRequest<PortalProjectDetail>(`/portal/projects/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * The progress board. Fetched only while its tab is open — it is a dozen bounded queries on the
 * API side, and a client opening the Files tab has no use for them.
 */
export function usePortalProjectProgressQuery(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: portalKeys.progress(id ?? ''),
    queryFn: () => apiRequest<PortalProjectProgress>(`/portal/projects/${id}/progress`),
    enabled: Boolean(id) && enabled,
  });
}

/** The plan behind the milestones tab. Its own request, made only while that tab is open. */
export function usePortalProjectPlanQuery(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: portalKeys.plan(id ?? ''),
    queryFn: () => apiRequest<PortalProjectPlan>(`/portal/projects/${id}/plan`),
    enabled: Boolean(id) && enabled,
  });
}

export function usePortalTicketsQuery(view: TicketListView) {
  return useQuery({
    queryKey: portalKeys.tickets(view),
    queryFn: () =>
      apiRequest<PaginatedResponse<PortalTicketSummary>>('/portal/tickets', {
        query: { view, limit: 100 },
      }),
  });
}

export function usePortalTicketQuery(id: string | undefined) {
  return useQuery({
    queryKey: portalKeys.ticket(id ?? ''),
    queryFn: () => apiRequest<PortalTicketDetail>(`/portal/tickets/${id}`),
    enabled: Boolean(id),
  });
}

export function usePortalUpdatesQuery(from: string, to: string) {
  return useQuery({
    queryKey: portalKeys.updates(from, to),
    queryFn: () => apiRequest<PortalClientUpdate[]>('/portal/updates', { query: { from, to } }),
  });
}

export function usePortalFilesQuery() {
  return useQuery({
    queryKey: portalKeys.files,
    queryFn: () => apiRequest<FileSummary[]>('/portal/files'),
  });
}

export function usePortalTicketMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: portalKeys.all });
  return {
    raise: useMutation({
      mutationFn: (body: CreateTicketInput) =>
        apiRequest<PortalTicketDetail>('/portal/tickets', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    reply: useMutation({
      mutationFn: (body: { body: string }) =>
        apiRequest<CommentSummary>(`/portal/tickets/${id}/reply`, { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    close: useMutation({
      mutationFn: () =>
        apiRequest<PortalTicketDetail>(`/portal/tickets/${id}/close`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    reopen: useMutation({
      mutationFn: (body: { reason: string }) =>
        apiRequest<PortalTicketDetail>(`/portal/tickets/${id}/reopen`, { method: 'POST', body }),
      onSuccess: invalidate,
    }),
  };
}
