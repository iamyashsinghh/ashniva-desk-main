import type {
  PaginatedResponse,
  ProjectReleasePolicySummary,
  ReleaseApprovalDecision,
  ReleaseApproverRole,
  ReleaseDetail,
  ReleaseItemKind,
  ReleaseStatus,
  ReleaseSummary,
  TestEnvironment,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface ReleaseListParams {
  projectId?: string;
  status?: ReleaseStatus[];
}

export interface UpdateReleaseInput {
  /** Draft only: the version is what the approvers signed and what is typed back at publish. */
  version?: string;
  title?: string;
  notes?: string | null;
  environment?: TestEnvironment;
}

export interface AddReleaseItemInput {
  kind: ReleaseItemKind;
  taskId?: string;
  ticketId?: string;
  changeRequestId?: string;
}

export const releaseKeys = {
  all: ['releases'] as const,
  list: (params: ReleaseListParams) => ['releases', 'list', params] as const,
  detail: (id: string) => ['releases', 'detail', id] as const,
  policy: (projectId: string) => ['releases', 'policy', projectId] as const,
};

export function useReleasesQuery(params: ReleaseListParams = {}) {
  return useQuery({
    queryKey: releaseKeys.list(params),
    queryFn: () =>
      apiRequest<PaginatedResponse<ReleaseSummary>>('/releases', {
        query: { projectId: params.projectId, status: params.status?.join(','), limit: 100 },
      }),
  });
}

export function useReleaseQuery(id: string | undefined) {
  return useQuery({
    queryKey: releaseKeys.detail(id ?? ''),
    queryFn: () => apiRequest<ReleaseDetail>(`/releases/${id}`),
    enabled: Boolean(id),
  });
}

export function useReleasePolicyQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: releaseKeys.policy(projectId ?? ''),
    queryFn: () => apiRequest<ProjectReleasePolicySummary>(`/projects/${projectId}/release-policy`),
    enabled: enabled && Boolean(projectId),
  });
}

/** Every field, so a PUT that omits one cannot be read as turning it off. */
export type ReleasePolicyInput = Pick<
  ProjectReleasePolicySummary,
  | 'approverRoles'
  | 'requiresQaPass'
  | 'requiresClientUat'
  | 'requiresLiveVerification'
  | 'requiresTypedConfirmation'
>;

/**
 * Changing what a release on this project has to satisfy.
 *
 * `PUT /projects/:id/release-policy` shipped with nothing calling it, which left the gates
 * unreachable from the app: `requiresQaPass` and `requiresLiveVerification` both default on, so a
 * project that did not want them had no way of saying so. Both the release and the policy caches
 * are invalidated, because the readiness checklist is computed from the policy.
 */
export function useReleasePolicyMutation(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReleasePolicyInput) =>
      apiRequest<ProjectReleasePolicySummary>(`/projects/${projectId}/release-policy`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: async (policy) => {
      client.setQueryData(releaseKeys.policy(projectId), policy);
      await client.invalidateQueries({ queryKey: releaseKeys.all });
    },
  });
}

export function useReleaseMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: releaseKeys.all });
  // Every write answers with the whole release, readiness included. Writing it back before the
  // refetch means the checklist and the Publish button move in the same paint as the action.
  const settle = (release: ReleaseDetail) => {
    client.setQueryData(releaseKeys.detail(release.id), release);
    return refresh();
  };
  const act = <T>(id: string, action: string, body?: T) =>
    apiRequest<ReleaseDetail>(`/releases/${id}/${action}`, { method: 'POST', body });

  return {
    create: useMutation({
      mutationFn: (input: { projectId: string; version: string; title: string; notes?: string }) =>
        apiRequest<ReleaseDetail>('/releases', { method: 'POST', body: input }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateReleaseInput }) =>
        apiRequest<ReleaseDetail>(`/releases/${id}`, { method: 'PATCH', body: input }),
      onSuccess: settle,
    }),
    addItem: useMutation({
      mutationFn: ({ id, input }: { id: string; input: AddReleaseItemInput }) =>
        act(id, 'items', input),
      onSuccess: settle,
    }),
    removeItem: useMutation({
      mutationFn: ({ id, itemId }: { id: string; itemId: string }) =>
        apiRequest<ReleaseDetail>(`/releases/${id}/items/${itemId}`, { method: 'DELETE' }),
      onSuccess: settle,
    }),
    requestApproval: useMutation({
      mutationFn: (id: string) => act(id, 'request-approval'),
      onSuccess: settle,
    }),
    approve: useMutation({
      mutationFn: ({
        id,
        decision,
        note,
        approverRole,
      }: {
        id: string;
        decision: ReleaseApprovalDecision;
        note?: string;
        approverRole?: ReleaseApproverRole;
      }) => act(id, 'approve', { decision, note, approverRole }),
      onSuccess: settle,
    }),
    schedule: useMutation({
      mutationFn: ({ id, at, note }: { id: string; at: string; note?: string }) =>
        act(id, 'schedule', { at, note }),
      onSuccess: settle,
    }),
    // The typed version goes to the server, which compares it. The dialog asking for it is a
    // courtesy; the check that matters is the one the UI cannot skip.
    publish: useMutation({
      mutationFn: ({ id, confirmVersion }: { id: string; confirmVersion?: string }) =>
        act(id, 'publish', { confirmVersion }),
      onSuccess: settle,
    }),
    verifyLive: useMutation({
      mutationFn: ({ id, note }: { id: string; note?: string }) => act(id, 'verify-live', { note }),
      onSuccess: settle,
    }),
    rollback: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        act(id, 'rollback', { reason }),
      onSuccess: settle,
    }),
    // The reason is required, as it is for a rejection: the release comes back with its sign-offs
    // cleared, and the approvers about to be asked again are owed the reason why.
    reopen: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) => act(id, 'reopen', { reason }),
      onSuccess: settle,
    }),
  };
}
