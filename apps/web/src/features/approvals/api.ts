import type {
  ApprovalDetail,
  ApprovalListView,
  ApprovalStatus,
  ApprovalSubjectType,
  ApprovalSummary,
  PaginatedResponse,
  PortalApprovalDetail,
  PortalApprovalSummary,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface ApprovalListParams {
  view?: ApprovalListView;
  status?: ApprovalStatus[];
  subjectType?: ApprovalSubjectType;
  clientOrganizationId?: string;
  projectId?: string;
  search?: string;
}

export const approvalKeys = {
  all: ['approvals'] as const,
  list: (params: ApprovalListParams) => ['approvals', 'list', params] as const,
  detail: (id: string) => ['approvals', 'detail', id] as const,
  portalList: ['portal', 'approvals'] as const,
  portalDetail: (id: string) => ['portal', 'approval', id] as const,
};

export function useApprovalsQuery(params: ApprovalListParams) {
  return useQuery({
    queryKey: approvalKeys.list(params),
    queryFn: () =>
      apiRequest<PaginatedResponse<ApprovalSummary>>('/approvals', {
        query: { ...params, status: params.status?.join(','), limit: 100 },
      }),
  });
}

export function useApprovalQuery(id: string | undefined) {
  return useQuery({
    queryKey: approvalKeys.detail(id ?? ''),
    queryFn: () => apiRequest<ApprovalDetail>(`/approvals/${id}`),
    enabled: Boolean(id),
  });
}

export function usePortalApprovalsQuery() {
  return useQuery({
    queryKey: approvalKeys.portalList,
    queryFn: () => apiRequest<PortalApprovalSummary[]>('/portal/approvals'),
  });
}

export function usePortalApprovalQuery(id: string | undefined) {
  return useQuery({
    queryKey: approvalKeys.portalDetail(id ?? ''),
    queryFn: () => apiRequest<PortalApprovalDetail>(`/portal/approvals/${id}`),
    enabled: Boolean(id),
  });
}

export interface CreateApprovalInput {
  title: string;
  summary: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  dueDate?: string | null;
  internalNotes?: string | null;
  fileIds?: string[];
}

type Transition = 'send-to-internal-review' | 'return-to-draft' | 'publish' | 'withdraw';

export function useApprovalMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: approvalKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['portal'] });
    await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    await queryClient.invalidateQueries({ queryKey: ['change-requests'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  return {
    create: useMutation({
      mutationFn: (body: CreateApprovalInput) =>
        apiRequest<ApprovalDetail>('/approvals', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (
        body: Partial<Pick<CreateApprovalInput, 'title' | 'summary' | 'dueDate' | 'internalNotes'>>,
      ) => apiRequest<ApprovalDetail>(`/approvals/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    transition: useMutation({
      mutationFn: ({ action, comment }: { action: Transition; comment?: string }) =>
        apiRequest<ApprovalDetail>(`/approvals/${id}/${action}`, {
          method: 'POST',
          body: { comment },
        }),
      onSuccess: invalidate,
    }),
    decide: useMutation({
      mutationFn: ({
        action,
        comment,
      }: {
        action: 'approve' | 'request-changes' | 'reject';
        comment?: string;
      }) =>
        apiRequest<PortalApprovalDetail>(`/portal/approvals/${id}/${action}`, {
          method: 'POST',
          body: { comment },
        }),
      onSuccess: invalidate,
    }),
  };
}
