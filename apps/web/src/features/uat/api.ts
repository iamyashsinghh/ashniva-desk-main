import type { UatCommentRow, UatRequestDetail, UatRequestSummary } from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

/**
 * Client acceptance testing, from the client's side.
 *
 * The portal endpoints return an allow-listed shape that carries no staging URL, no credential
 * and no internal note — the server guarantees that, and nothing here tries to ask for more.
 */

export const uatKeys = {
  all: ['uat'] as const,
  portalList: () => ['uat', 'portal', 'list'] as const,
  portalDetail: (id: string) => ['uat', 'portal', id] as const,
  internalList: (releaseId?: string) => ['uat', 'internal', releaseId ?? 'all'] as const,
  internalDetail: (id: string) => ['uat', 'internal', 'detail', id] as const,
};

/**
 * The sign-offs raised for clients, from the provider's side.
 *
 * `enabled` lets the release page skip the request for somebody without `release:manage` rather
 * than show them a failed panel.
 */
export function useUatRequestsQuery(releaseId?: string, enabled = true) {
  return useQuery({
    queryKey: uatKeys.internalList(releaseId),
    queryFn: () => apiRequest<UatRequestSummary[]>('/uat', { query: { releaseId } }),
    enabled,
  });
}

export interface RequestSignOffInput {
  releaseId?: string;
  taskId?: string;
  /** Plain language, no jargon: this is the whole of what the client is shown. */
  summaryPlain: string;
  previewUrl?: string;
  checklist?: string[];
}

/**
 * Asking a client to sign off.
 *
 * `POST /uat` shipped with the client's half fully built and nothing on this side calling it, so
 * a project with `requiresClientUat` was permanently unpublishable: the gate waited for a request
 * that nothing could raise. There is deliberately no client field — the server derives the client
 * from the release or task, so a mistyped id cannot put one client's summary in another's portal.
 */
export function useRequestSignOff() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestSignOffInput) =>
      apiRequest<UatRequestSummary>('/uat', { method: 'POST', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: uatKeys.all });
      // The UAT gate on the release readiness checklist moves with this.
      await client.invalidateQueries({ queryKey: ['releases'] });
    },
  });
}

/**
 * One sign-off request and its thread, from the provider's side.
 *
 * `GET /uat/:id` and `POST /uat/:id/comments` shipped documented as "the provider's reply on the
 * thread" with nothing calling either, so a client could ask a question before approving and the
 * only person who could answer it never saw it: the release page printed a status and a note.
 */
export function useUatRequestQuery(id: string | undefined) {
  return useQuery({
    queryKey: uatKeys.internalDetail(id ?? ''),
    queryFn: () => apiRequest<UatRequestDetail>(`/uat/${id}`),
    enabled: Boolean(id),
  });
}

/** The provider's reply on a thread the client started. */
export function useUatReply(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiRequest<UatCommentRow>(`/uat/${id}/comments`, { method: 'POST', body: { body } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: uatKeys.all });
    },
  });
}

export function usePortalUatListQuery() {
  return useQuery({
    queryKey: uatKeys.portalList(),
    queryFn: () => apiRequest<UatRequestSummary[]>('/portal/uat'),
  });
}

export function usePortalUatQuery(id: string | undefined) {
  return useQuery({
    queryKey: uatKeys.portalDetail(id ?? ''),
    queryFn: () => apiRequest<UatRequestSummary>(`/portal/uat/${id}`),
    enabled: Boolean(id),
  });
}

export function usePortalUatMutations(id: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: uatKeys.all });

  return {
    decide: useMutation({
      mutationFn: (input: { decision: 'APPROVED' | 'CHANGES_REQUESTED'; note?: string }) =>
        apiRequest<UatRequestSummary>(`/portal/uat/${id}/decide`, {
          method: 'POST',
          body: input,
        }),
      onSuccess: refresh,
    }),
    comment: useMutation({
      mutationFn: (body: string) =>
        apiRequest<UatRequestSummary>(`/portal/uat/${id}/comments`, {
          method: 'POST',
          body: { body },
        }),
      onSuccess: refresh,
    }),
  };
}
