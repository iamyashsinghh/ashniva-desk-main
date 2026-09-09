import type {
  IncidentDetail,
  IncidentLinkKind,
  IncidentStatus,
  IncidentSummary,
  PaginatedResponse,
  Priority,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';
import { problemKeys, type IncidentListParams } from './api';

/**
 * Reading and writing incidents.
 *
 * Split from `api.ts` rather than folded into it because they are two aggregates: a problem is
 * investigated over days and an incident is worked in minutes. They share `problemKeys` so that
 * one write invalidates both — an incident opened against a problem changes the problem's screen.
 */

export function useIncidentsQuery(params: IncidentListParams = {}) {
  return useQuery({
    queryKey: problemKeys.incidents(params),
    queryFn: () =>
      apiRequest<PaginatedResponse<IncidentSummary>>('/incidents', {
        query: {
          status: params.status?.join(','),
          projectId: params.projectId,
          problemId: params.problemId,
          limit: 100,
        },
      }),
  });
}

export function useIncidentQuery(id: string | undefined) {
  return useQuery({
    queryKey: problemKeys.incident(id ?? ''),
    queryFn: () => apiRequest<IncidentDetail>(`/incidents/${id}`),
    enabled: Boolean(id),
  });
}

/** Every write on an incident. Publishing the client summary is one of them, never a side effect. */
export function useIncidentMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: problemKeys.all });
  const settle = (incident: IncidentDetail) => {
    client.setQueryData(problemKeys.incident(incident.id), incident);
    return refresh();
  };
  const act = <T>(id: string, action: string, body?: T) =>
    apiRequest<IncidentDetail>(`/incidents/${id}/${action}`, { method: 'POST', body });

  return {
    create: useMutation({
      mutationFn: (input: {
        title: string;
        description: string;
        severity: Priority;
        impact?: string;
        projectId?: string;
        problemId?: string;
      }) => apiRequest<IncidentDetail>('/incidents', { method: 'POST', body: input }),
      onSuccess: settle,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input: {
          status?: IncidentStatus;
          severity?: Priority;
          impact?: string;
          internalNotes?: string;
          clientSummary?: string;
        };
      }) => apiRequest<IncidentDetail>(`/incidents/${id}`, { method: 'PATCH', body: input }),
      onSuccess: settle,
    }),
    requestEmergencyFix: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        act(id, 'request-emergency-fix', { reason }),
      onSuccess: settle,
    }),
    decideEmergencyFix: useMutation({
      mutationFn: ({
        id,
        decision,
        reason,
      }: {
        id: string;
        decision: 'APPROVED' | 'REJECTED';
        reason: string;
      }) => act(id, 'approve-emergency-fix', { decision, reason }),
      onSuccess: settle,
    }),
    /**
     * Linking the work an incident touches.
     *
     * `POST /incidents/:id/links` existed with nothing calling it, while the empty state on the
     * incident page told the reader to link tickets, tasks and releases — an instruction with no
     * control behind it. Exactly one of the three ids, which is what the API insists on.
     */
    addLink: useMutation({
      mutationFn: ({
        id,
        ...link
      }: {
        id: string;
        kind: IncidentLinkKind;
        ticketId?: string;
        taskId?: string;
        releaseId?: string;
      }) => act(id, 'links', link),
      onSuccess: settle,
    }),
    addNote: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) => act(id, 'notes', { body }),
      onSuccess: settle,
    }),
    resolve: useMutation({
      mutationFn: ({ id, resolution }: { id: string; resolution: string }) =>
        act(id, 'resolve', { resolution }),
      onSuccess: settle,
    }),
    close: useMutation({
      mutationFn: ({ id, note }: { id: string; note?: string }) => act(id, 'close', { note }),
      onSuccess: settle,
    }),
    publishClientSummary: useMutation({
      mutationFn: ({ id, clientSummary }: { id: string; clientSummary?: string }) =>
        act(id, 'publish-client-summary', { clientSummary }),
      onSuccess: settle,
    }),
  };
}
