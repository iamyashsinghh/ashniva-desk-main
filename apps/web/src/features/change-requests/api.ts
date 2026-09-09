import type {
  ChangeRequestDetail,
  ChangeRequestStatus,
  ChangeRequestSummary,
  CommentSummary,
  PaginatedResponse,
  PortalChangeRequestDetail,
  PortalChangeRequestSummary,
  Visibility,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface ChangeRequestListParams {
  status?: ChangeRequestStatus[];
  clientOrganizationId?: string;
  projectId?: string;
  contractId?: string;
  mine?: boolean;
  search?: string;
}

export const changeRequestKeys = {
  all: ['change-requests'] as const,
  list: (params: ChangeRequestListParams, portal: boolean) =>
    ['change-requests', 'list', portal, params] as const,
  detail: (id: string) => ['change-requests', 'detail', id] as const,
  portalDetail: (id: string) => ['change-requests', 'portal', id] as const,
};

export function useChangeRequestsQuery(params: ChangeRequestListParams, enabled = true) {
  return useQuery({
    queryKey: changeRequestKeys.list(params, false),
    queryFn: () =>
      apiRequest<PaginatedResponse<ChangeRequestSummary>>('/change-requests', {
        query: { ...params, status: params.status?.join(','), limit: 100 },
      }),
    enabled,
  });
}

export function usePortalChangeRequestsQuery(params: ChangeRequestListParams = {}) {
  return useQuery({
    queryKey: changeRequestKeys.list(params, true),
    queryFn: () =>
      apiRequest<PaginatedResponse<PortalChangeRequestSummary>>('/portal/change-requests', {
        query: { ...params, status: params.status?.join(','), limit: 100 },
      }),
  });
}

export function useChangeRequestQuery(id: string | undefined) {
  return useQuery({
    queryKey: changeRequestKeys.detail(id ?? ''),
    queryFn: () => apiRequest<ChangeRequestDetail>(`/change-requests/${id}`),
    enabled: Boolean(id),
  });
}

export function usePortalChangeRequestQuery(id: string | undefined) {
  return useQuery({
    queryKey: changeRequestKeys.portalDetail(id ?? ''),
    queryFn: () => apiRequest<PortalChangeRequestDetail>(`/portal/change-requests/${id}`),
    enabled: Boolean(id),
  });
}

export interface ChangeRequestInput {
  title: string;
  description: string;
  businessReason?: string | null;
  scope?: string | null;
  impact?: string | null;
  projectId?: string | null;
  contractId?: string | null;
  clientOrganizationId?: string;
  requestedById?: string;
  fileIds?: string[];
}

export interface ChangeRequestStaffInput {
  estimatedMinutes?: number | null;
  costImpact?: string | null;
  currency?: string;
  timelineImpactDays?: number | null;
  internalNotes?: string | null;
}

export interface GenerateTasksInput {
  projectId?: string;
  milestoneId?: string;
  milestone?: { name: string; dueDate?: string; clientVisible?: boolean };
  tasks: Array<{ title: string; description?: string; assignedToId?: string; dueDate?: string }>;
}

type Step =
  | 'submit'
  | 'start-internal-review'
  | 'send-to-client'
  | 'request-changes'
  | 'reject'
  | 'schedule'
  | 'complete'
  | 'cancel'
  | 'reopen-draft'
  | 'approve';

/** `portal` switches every call to the client-portal routes. */
export function useChangeRequestMutations(id?: string, portal = false) {
  const queryClient = useQueryClient();
  const base = portal ? '/portal/change-requests' : '/change-requests';
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: changeRequestKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['approvals'] });
    await queryClient.invalidateQueries({ queryKey: ['portal'] });
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  return {
    create: useMutation({
      mutationFn: (body: ChangeRequestInput) =>
        apiRequest<ChangeRequestDetail | PortalChangeRequestDetail>(base, { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (body: Partial<ChangeRequestInput> & ChangeRequestStaffInput) =>
        apiRequest<ChangeRequestDetail | PortalChangeRequestDetail>(`${base}/${id}`, {
          method: 'PATCH',
          body,
        }),
      onSuccess: invalidate,
    }),
    comment: useMutation({
      mutationFn: (body: { body: string; visibility?: Visibility }) =>
        apiRequest<CommentSummary>(`${base}/${id}/comments`, { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    step: useMutation({
      mutationFn: ({
        step,
        note,
        scheduledFor,
      }: {
        step: Step;
        note?: string;
        scheduledFor?: string;
      }) =>
        apiRequest<ChangeRequestDetail | PortalChangeRequestDetail>(`${base}/${id}/${step}`, {
          method: 'POST',
          body: { note, scheduledFor },
        }),
      onSuccess: invalidate,
    }),
    generateTasks: useMutation({
      mutationFn: (body: GenerateTasksInput) =>
        apiRequest<ChangeRequestDetail>(`/change-requests/${id}/generate-tasks`, {
          method: 'POST',
          body,
        }),
      onSuccess: invalidate,
    }),
  };
}
