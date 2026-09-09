import type {
  IncidentStatus,
  PaginatedResponse,
  Priority,
  ProblemDetail,
  ProblemStatus,
  ProblemSummary,
  ProblemTicketRelation,
  RecurringGroupBy,
  RecurringReport,
  SimilarTicketsResponse,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface ProblemListParams {
  status?: ProblemStatus[];
  projectId?: string;
  search?: string;
}

export interface IncidentListParams {
  status?: IncidentStatus[];
  projectId?: string;
  problemId?: string;
}

export interface RecurringParams {
  by?: RecurringGroupBy;
  windowDays?: number;
  projectId?: string;
}

export const problemKeys = {
  all: ['problems'] as const,
  list: (params: ProblemListParams) => ['problems', 'list', params] as const,
  detail: (id: string) => ['problems', 'detail', id] as const,
  similar: (ticketId: string) => ['problems', 'similar', ticketId] as const,
  recurring: (params: RecurringParams) => ['problems', 'recurring', params] as const,
  incidents: (params: IncidentListParams) => ['problems', 'incidents', params] as const,
  incident: (id: string) => ['problems', 'incident', id] as const,
};

export function useProblemsQuery(params: ProblemListParams = {}) {
  return useQuery({
    queryKey: problemKeys.list(params),
    queryFn: () =>
      apiRequest<PaginatedResponse<ProblemSummary>>('/problems', {
        query: {
          status: params.status?.join(','),
          projectId: params.projectId,
          search: params.search,
          limit: 100,
        },
      }),
  });
}

export function useProblemQuery(id: string | undefined) {
  return useQuery({
    queryKey: problemKeys.detail(id ?? ''),
    queryFn: () => apiRequest<ProblemDetail>(`/problems/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Suggested duplicates for one ticket.
 *
 * Deliberately not fetched for a reader who cannot see problems: the API answers 403, and asking
 * anyway would put an error in the console of every support screen a developer opens.
 */
export function useSimilarTicketsQuery(ticketId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: problemKeys.similar(ticketId ?? ''),
    queryFn: () => apiRequest<SimilarTicketsResponse>(`/tickets/${ticketId}/similar`),
    enabled: enabled && Boolean(ticketId),
  });
}

export function useRecurringReportQuery(params: RecurringParams) {
  return useQuery({
    queryKey: problemKeys.recurring(params),
    queryFn: () =>
      apiRequest<RecurringReport>('/reports/recurring', {
        query: { by: params.by, windowDays: params.windowDays, projectId: params.projectId },
      }),
  });
}

export interface SubmitRcaInput {
  what: string;
  why: string;
  affectedClientsVersions: string;
  introducedBy: string;
  workaround?: string;
  permanentFix: string;
  prevention: string;
  testsAdded?: string;
  targetDate?: string;
  draft?: boolean;
}

/**
 * Every write on a problem, and every write on the analysis attached to it.
 *
 * All of them answer with the whole problem — status, closure decision and all — so the response
 * is written straight back into the cache before the refetch. That is what keeps the Close button
 * and the sentence under it moving in the same paint as the action that changed them.
 */
export function useProblemMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: problemKeys.all });
  const settle = (problem: ProblemDetail) => {
    client.setQueryData(problemKeys.detail(problem.id), problem);
    return refresh();
  };
  const act = <T>(id: string, action: string, body?: T) =>
    apiRequest<ProblemDetail>(`/problems/${id}/${action}`, { method: 'POST', body });

  return {
    create: useMutation({
      mutationFn: (input: {
        title: string;
        description?: string;
        severity?: Priority;
        projectId?: string;
        module?: string;
        ticketIds?: string[];
      }) => apiRequest<ProblemDetail>('/problems', { method: 'POST', body: input }),
      onSuccess: settle,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input: {
          title?: string;
          description?: string;
          severity?: Priority;
          ownerId?: string | null;
        };
      }) => apiRequest<ProblemDetail>(`/problems/${id}`, { method: 'PATCH', body: input }),
      onSuccess: settle,
    }),
    linkTickets: useMutation({
      mutationFn: ({
        id,
        ticketIds,
        relation,
      }: {
        id: string;
        ticketIds: string[];
        relation?: ProblemTicketRelation;
      }) => act(id, 'tickets', { ticketIds, relation }),
      onSuccess: settle,
    }),
    requestRca: useMutation({
      mutationFn: ({ id, dueDate, ownerId }: { id: string; dueDate?: string; ownerId?: string }) =>
        act(id, 'request-rca', { dueDate, ownerId }),
      onSuccess: settle,
    }),
    submitRca: useMutation({
      mutationFn: ({ id, input }: { id: string; input: SubmitRcaInput }) => act(id, 'rca', input),
      onSuccess: settle,
    }),
    reviewRca: useMutation({
      mutationFn: ({
        rcaId,
        decision,
        note,
      }: {
        rcaId: string;
        decision: 'APPROVED' | 'CHANGES_REQUESTED';
        note?: string;
      }) =>
        apiRequest<ProblemDetail>(`/rca/${rcaId}/approve`, {
          method: 'PATCH',
          body: { decision, note },
        }),
      onSuccess: settle,
    }),
    askDeveloper: useMutation({
      mutationFn: ({
        id,
        body,
        questionId,
        answer,
      }: {
        id: string;
        body?: string;
        questionId?: string;
        answer?: string;
      }) => act(id, 'ask-developer', { body, questionId, answer }),
      onSuccess: settle,
    }),
    assignFix: useMutation({
      mutationFn: ({ id, taskId }: { id: string; taskId: string }) =>
        act(id, 'assign-fix', { taskId }),
      onSuccess: settle,
    }),
    preventiveTest: useMutation({
      mutationFn: ({
        id,
        preventiveTest,
        taskId,
      }: {
        id: string;
        preventiveTest?: string;
        taskId?: string;
      }) => act(id, 'preventive-test', { preventiveTest, taskId }),
      onSuccess: settle,
    }),
    close: useMutation({
      mutationFn: ({ id, note }: { id: string; note?: string }) => act(id, 'close', { note }),
      onSuccess: settle,
    }),
  };
}

/** Confirming or dismissing one suggested duplicate, from the ticket it was suggested on. */
export function useSimilarityMutations(ticketId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      candidateId,
      decision,
      problemId,
    }: {
      candidateId: string;
      decision: 'LINKED' | 'DISMISSED';
      problemId?: string;
    }) =>
      apiRequest<SimilarTicketsResponse>(`/tickets/${ticketId}/similar/${candidateId}/decide`, {
        method: 'POST',
        body: { decision, problemId },
      }),
    onSuccess: (response) => {
      client.setQueryData(problemKeys.similar(ticketId), response);
      return client.invalidateQueries({ queryKey: problemKeys.all });
    },
  });
}
