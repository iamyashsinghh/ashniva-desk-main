import type {
  MilestoneDetail,
  MilestoneStatus,
  MilestoneSummary,
  PortalMilestoneSummary,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface MilestoneListParams {
  projectId?: string;
  contractId?: string;
  clientOrganizationId?: string;
  status?: MilestoneStatus[];
  mine?: boolean;
}

export const milestoneKeys = {
  all: ['milestones'] as const,
  list: (params: MilestoneListParams) => ['milestones', 'list', params] as const,
  detail: (id: string) => ['milestones', 'detail', id] as const,
  portal: (projectId?: string) => ['portal', 'milestones', projectId] as const,
};

export function useMilestonesQuery(params: MilestoneListParams, enabled = true) {
  return useQuery({
    queryKey: milestoneKeys.list(params),
    queryFn: () =>
      apiRequest<MilestoneSummary[]>('/milestones', {
        query: { ...params, status: params.status?.join(',') },
      }),
    enabled,
  });
}

export function useMilestoneQuery(id: string | undefined) {
  return useQuery({
    queryKey: milestoneKeys.detail(id ?? ''),
    queryFn: () => apiRequest<MilestoneDetail>(`/milestones/${id}`),
    enabled: Boolean(id),
  });
}

export function usePortalMilestonesQuery(projectId?: string) {
  return useQuery({
    queryKey: milestoneKeys.portal(projectId),
    queryFn: () =>
      apiRequest<PortalMilestoneSummary[]>('/portal/milestones', { query: { projectId } }),
  });
}

export interface DeliverableInput {
  title: string;
  description?: string;
  isDone?: boolean;
}

export interface MilestoneInput {
  projectId: string;
  contractId?: string | null;
  name: string;
  description?: string | null;
  ownerUserId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  clientVisible?: boolean;
  requiresApproval?: boolean;
  sortOrder?: number;
  deliverables?: DeliverableInput[];
  dependsOnIds?: string[];
}

export function useMilestoneMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: milestoneKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['contracts'] });
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    await queryClient.invalidateQueries({ queryKey: ['portal'] });
  };
  return {
    create: useMutation({
      mutationFn: (body: MilestoneInput) =>
        apiRequest<MilestoneDetail>('/milestones', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (body: Partial<Omit<MilestoneInput, 'projectId'>>) =>
        apiRequest<MilestoneDetail>(`/milestones/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    changeStatus: useMutation({
      mutationFn: (body: { status: MilestoneStatus; note?: string }) =>
        apiRequest<MilestoneDetail>(`/milestones/${id}/status`, { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    adjustProgress: useMutation({
      mutationFn: (body: { progressPercent: number; reason: string; resetToAuto?: boolean }) =>
        apiRequest<MilestoneDetail>(`/milestones/${id}/progress`, { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    setDeliverable: useMutation({
      mutationFn: ({ deliverableId, isDone }: { deliverableId: string; isDone: boolean }) =>
        apiRequest<MilestoneDetail>(`/milestones/${id}/deliverables/${deliverableId}`, {
          method: 'PATCH',
          body: { isDone },
        }),
      onSuccess: invalidate,
    }),
  };
}
