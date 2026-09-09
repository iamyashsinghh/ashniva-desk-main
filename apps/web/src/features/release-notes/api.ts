import type {
  PaginatedResponse,
  PortalReleaseNote,
  PortalReleaseNoteSummary,
  ReleaseNoteDetail,
  ReleaseNoteItemKind,
  ReleaseNoteStatus,
  ReleaseNoteSummary,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface ReleaseNoteListParams {
  projectId?: string;
  status?: ReleaseNoteStatus[];
}

export const releaseNoteKeys = {
  all: ['release-notes'] as const,
  list: (params: ReleaseNoteListParams) => ['release-notes', 'list', params] as const,
  detail: (id: string) => ['release-notes', 'detail', id] as const,
  portalList: () => ['release-notes', 'portal', 'list'] as const,
  portalDetail: (id: string) => ['release-notes', 'portal', id] as const,
};

export function useReleaseNotesQuery(params: ReleaseNoteListParams = {}) {
  return useQuery({
    queryKey: releaseNoteKeys.list(params),
    queryFn: () =>
      apiRequest<PaginatedResponse<ReleaseNoteSummary>>('/release-notes', {
        query: { projectId: params.projectId, status: params.status?.join(','), limit: 100 },
      }),
  });
}

export function useReleaseNoteQuery(id: string | undefined) {
  return useQuery({
    queryKey: releaseNoteKeys.detail(id ?? ''),
    queryFn: () => apiRequest<ReleaseNoteDetail>(`/release-notes/${id}`),
    enabled: Boolean(id),
  });
}

export function usePortalReleaseNotesQuery() {
  return useQuery({
    queryKey: releaseNoteKeys.portalList(),
    queryFn: () =>
      apiRequest<PaginatedResponse<PortalReleaseNoteSummary>>('/portal/release-notes', {
        query: { limit: 100 },
      }),
  });
}

export function usePortalReleaseNoteQuery(id: string | undefined) {
  return useQuery({
    queryKey: releaseNoteKeys.portalDetail(id ?? ''),
    queryFn: () => apiRequest<PortalReleaseNote>(`/portal/release-notes/${id}`),
    enabled: Boolean(id),
  });
}

export interface CreateReleaseNoteInput {
  projectId: string;
  version: string;
  releaseDate: string;
  clientSummary?: string;
  internalNotes?: string;
}

export interface AddItemInput {
  kind: ReleaseNoteItemKind;
  refId?: string;
  externalRef?: string;
  label: string;
  clientLabel?: string;
  clientVisible?: boolean;
}

export interface GenerateInput {
  periodStart?: string;
  periodEnd?: string;
  defaultDays?: number;
  background?: boolean;
}

/** The workflow steps, named as the routes are. */
export type ReleaseNoteStep =
  'submit' | 'approve' | 'request-changes' | 'publish' | 'cancel' | 'return-to-draft';

export function useReleaseNoteMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: releaseNoteKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['portal'] });
  };

  return {
    create: useMutation({
      mutationFn: (body: CreateReleaseNoteInput) =>
        apiRequest<ReleaseNoteDetail>('/release-notes', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (body: Partial<CreateReleaseNoteInput>) =>
        apiRequest<ReleaseNoteDetail>(`/release-notes/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    generate: useMutation({
      mutationFn: (body: GenerateInput) =>
        apiRequest<ReleaseNoteDetail>(`/release-notes/${id}/generate`, { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    addItem: useMutation({
      mutationFn: (body: AddItemInput) =>
        apiRequest<ReleaseNoteDetail>(`/release-notes/${id}/items`, { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    removeItem: useMutation({
      mutationFn: (itemId: string) =>
        apiRequest<ReleaseNoteDetail>(`/release-notes/${id}/items/${itemId}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
    reorder: useMutation({
      mutationFn: (itemIds: string[]) =>
        apiRequest<ReleaseNoteDetail>(`/release-notes/${id}/items/order`, {
          method: 'PATCH',
          body: { itemIds },
        }),
      onSuccess: invalidate,
    }),
    step: useMutation({
      mutationFn: ({ step, note }: { step: ReleaseNoteStep; note?: string }) =>
        apiRequest<ReleaseNoteDetail>(`/release-notes/${id}/${step}`, {
          method: 'POST',
          body: { note },
        }),
      onSuccess: invalidate,
    }),
  };
}
