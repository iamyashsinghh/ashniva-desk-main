import type {
  AiProviderStatus,
  AiSourceKind,
  AiSummaryDetail,
  AiSummaryListRow,
  AiSummaryStatus,
  AiSummaryType,
  AiSummaryVersionDetail,
  AiUsageTotals,
} from '@ashniva/types';

import { useApiMutation } from '../../shared/api/mutations';
import { usePagedResource, useResource } from '../../shared/api/queries';

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

export const aiSummaryKeys = {
  all: ['ai-summaries'] as const,
  list: (statuses: readonly AiSummaryStatus[] | undefined, search: string) =>
    ['ai-summaries', 'list', statuses ?? 'all', search] as const,
  detail: (id: string) => ['ai-summaries', 'detail', id] as const,
  sources: (id: string, generatedAt: string | null) =>
    ['ai-summaries', 'sources', id, generatedAt] as const,
  version: (id: string, version: number) => ['ai-summaries', 'version', id, version] as const,
  provider: ['ai-summaries', 'provider-status'] as const,
  usage: ['ai-summaries', 'usage'] as const,
};

export function useAiSummaries(
  statuses: readonly AiSummaryStatus[] | undefined,
  search: string,
  enabled: boolean,
) {
  return usePagedResource<AiSummaryListRow>(
    aiSummaryKeys.list(statuses, search),
    '/ai-summaries',
    { status: statuses?.join(','), search: search || undefined, limit: 50 },
    enabled,
  );
}

/**
 * One summary. While it is generating the screen re-reads it every few seconds: generation runs on
 * a queue, and the person who pressed "Generate" is waiting for exactly this change.
 */
export function useAiSummary(id: string, polling: boolean, enabled = true) {
  return useResource<AiSummaryDetail>(aiSummaryKeys.detail(id), `/ai-summaries/${id}`, {
    enabled,
    refetchInterval: polling ? 4000 : false,
  });
}

/** Keyed by the generation time, so a finished run's new sources are read without a manual refresh. */
export function useAiSources(id: string, generatedAt: string | null) {
  return useResource<AiSourceInspection[]>(
    aiSummaryKeys.sources(id, generatedAt),
    `/ai-summaries/${id}/sources`,
  );
}

export function useAiVersion(id: string, version: number | null) {
  return useResource<AiSummaryVersionDetail>(
    aiSummaryKeys.version(id, version ?? 0),
    `/ai-summaries/${id}/versions/${version}`,
    { enabled: version !== null },
  );
}

export function useAiProviderStatus(enabled = true) {
  return useResource<AiProviderStatus>(aiSummaryKeys.provider, '/ai-summaries/provider-status', {
    enabled,
  });
}

export function useAiUsage(enabled = true) {
  return useResource<AiUsageTotals>(aiSummaryKeys.usage, '/ai-summaries/usage', { enabled });
}

export interface CreateAiSummaryInput {
  type: AiSummaryType;
  projectId?: string;
  subjectUserId?: string;
  periodStart: string;
  periodEnd: string;
}

export interface EditAiSummaryInput {
  internalContent?: string;
  clientContent?: string;
}

/** The workflow steps, named as the routes are. */
export type AiSummaryStep =
  'submit' | 'approve' | 'request-changes' | 'publish' | 'cancel' | 'return-to-draft';

/** Every write marks every summary read stale: a status change moves a row between the views. */
const INVALIDATE = [aiSummaryKeys.all] as const;

export function useCreateAiSummary() {
  return useApiMutation<CreateAiSummaryInput, AiSummaryDetail>({
    path: '/ai-summaries',
    body: (input) => input,
    invalidate: INVALIDATE,
  });
}

export function useGenerateAiSummary() {
  return useApiMutation<string, AiSummaryDetail>({
    path: (id) => `/ai-summaries/${id}/generate`,
    invalidate: INVALIDATE,
  });
}

export function useEditAiSummary(id: string) {
  return useApiMutation<EditAiSummaryInput, AiSummaryDetail>({
    path: `/ai-summaries/${id}`,
    method: 'PATCH',
    body: (input) => input,
    invalidate: INVALIDATE,
  });
}

export function useAiSummaryStep(id: string) {
  return useApiMutation<{ step: AiSummaryStep; note?: string }, AiSummaryDetail>({
    path: ({ step }) => `/ai-summaries/${id}/${step}`,
    body: ({ note }) => (note ? { note } : undefined),
    invalidate: INVALIDATE,
  });
}
