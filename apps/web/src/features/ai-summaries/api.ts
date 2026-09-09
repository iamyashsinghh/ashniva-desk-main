import type {
  AiProviderStatus,
  AiSourceKind,
  AiSummaryDetail,
  AiSummaryListRow,
  AiSummaryStatus,
  AiSummaryType,
  AiSummaryVersionDetail,
  AiUsageTotals,
  PaginatedResponse,
  PortalAiSummary,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

/** A source as the inspection endpoint returns it: with the text that was actually sent. */
export interface AiSourceInspection {
  id: string;
  kind: AiSourceKind;
  refId: string | null;
  label: string;
  occurredAt: string | null;
  clientVisible: boolean;
  promptText: string | null;
}

export interface AiSummaryListParams {
  type?: AiSummaryType[];
  status?: AiSummaryStatus[];
  projectId?: string;
  subjectUserId?: string;
  search?: string;
}

export const aiSummaryKeys = {
  all: ['ai-summaries'] as const,
  list: (params: AiSummaryListParams) => ['ai-summaries', 'list', params] as const,
  detail: (id: string) => ['ai-summaries', 'detail', id] as const,
  sources: (id: string) => ['ai-summaries', 'sources', id] as const,
  version: (id: string, version: number) => ['ai-summaries', 'version', id, version] as const,
  status: () => ['ai-summaries', 'provider-status'] as const,
  usage: () => ['ai-summaries', 'usage'] as const,
  portalList: () => ['ai-summaries', 'portal', 'list'] as const,
  portalDetail: (id: string) => ['ai-summaries', 'portal', id] as const,
};

export function useAiSummariesQuery(params: AiSummaryListParams = {}) {
  return useQuery({
    queryKey: aiSummaryKeys.list(params),
    queryFn: () =>
      apiRequest<PaginatedResponse<AiSummaryListRow>>('/ai-summaries', {
        query: {
          type: params.type?.join(','),
          status: params.status?.join(','),
          projectId: params.projectId,
          subjectUserId: params.subjectUserId,
          search: params.search,
          limit: 100,
        },
      }),
  });
}

export function useAiSummaryQuery(id: string | undefined) {
  return useQuery({
    queryKey: aiSummaryKeys.detail(id ?? ''),
    queryFn: () => apiRequest<AiSummaryDetail>(`/ai-summaries/${id}`),
    enabled: Boolean(id),
  });
}

export function useAiSourcesQuery(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: aiSummaryKeys.sources(id ?? ''),
    queryFn: () => apiRequest<AiSourceInspection[]>(`/ai-summaries/${id}/sources`),
    enabled: Boolean(id) && enabled,
  });
}

export function useAiVersionQuery(id: string | undefined, version: number | null) {
  return useQuery({
    queryKey: aiSummaryKeys.version(id ?? '', version ?? 0),
    queryFn: () => apiRequest<AiSummaryVersionDetail>(`/ai-summaries/${id}/versions/${version}`),
    enabled: Boolean(id) && version !== null,
  });
}

export function useAiProviderStatusQuery() {
  return useQuery({
    queryKey: aiSummaryKeys.status(),
    queryFn: () => apiRequest<AiProviderStatus>('/ai-summaries/provider-status'),
  });
}

export function useAiUsageQuery() {
  return useQuery({
    queryKey: aiSummaryKeys.usage(),
    queryFn: () => apiRequest<AiUsageTotals>('/ai-summaries/usage'),
  });
}

export function usePortalAiSummariesQuery() {
  return useQuery({
    queryKey: aiSummaryKeys.portalList(),
    queryFn: () =>
      apiRequest<PaginatedResponse<PortalAiSummary>>('/portal/ai-summaries', {
        query: { limit: 50 },
      }),
  });
}

export function usePortalAiSummaryQuery(id: string | undefined) {
  return useQuery({
    queryKey: aiSummaryKeys.portalDetail(id ?? ''),
    queryFn: () => apiRequest<PortalAiSummary>(`/portal/ai-summaries/${id}`),
    enabled: Boolean(id),
  });
}

export interface CreateAiSummaryInput {
  type: AiSummaryType;
  title?: string;
  projectId?: string;
  subjectUserId?: string;
  ticketId?: string;
  clientOrganizationId?: string;
  periodStart: string;
  periodEnd: string;
}

export interface EditAiSummaryInput {
  title?: string;
  internalContent?: string;
  clientContent?: string;
}

/** The workflow steps, named as the routes are. */
export type AiSummaryStep =
  'submit' | 'approve' | 'request-changes' | 'publish' | 'cancel' | 'return-to-draft';

export function useAiSummaryMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: aiSummaryKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['portal'] });
  };

  return {
    create: useMutation({
      mutationFn: (body: CreateAiSummaryInput) =>
        apiRequest<AiSummaryDetail>('/ai-summaries', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    generate: useMutation({
      mutationFn: () =>
        apiRequest<AiSummaryDetail>(`/ai-summaries/${id}/generate`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    edit: useMutation({
      mutationFn: (body: EditAiSummaryInput) =>
        apiRequest<AiSummaryDetail>(`/ai-summaries/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    step: useMutation({
      mutationFn: ({ step, note }: { step: AiSummaryStep; note?: string }) =>
        apiRequest<AiSummaryDetail>(`/ai-summaries/${id}/${step}`, {
          method: 'POST',
          body: note ? { note } : undefined,
        }),
      onSuccess: invalidate,
    }),
  };
}
