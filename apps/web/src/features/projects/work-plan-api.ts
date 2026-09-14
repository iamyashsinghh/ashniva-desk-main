import type { ParseWorkPlanInput, ProjectWorkPlan, SaveWorkPlanInput } from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';
import { projectKeys } from './api';

export const workPlanKeys = {
  detail: (projectId: string) => [...projectKeys.detail(projectId), 'work-plan'] as const,
};

export function useWorkPlanQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: workPlanKeys.detail(projectId ?? ''),
    queryFn: () => apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan`),
    enabled: Boolean(projectId) && enabled,
    refetchInterval: (query) =>
      (query.state.data?.phases ?? []).some((phase) =>
        phase.titles.some((title) =>
          title.points.some((point) => point.startedAt && !point.completedAt),
        ),
      )
        ? 5_000
        : false,
  });
}

export function useWorkPlanMutations(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: workPlanKeys.detail(projectId) });
  return {
    parse: useMutation({
      mutationFn: (body: ParseWorkPlanInput) =>
        apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan/parse`, {
          method: 'POST',
          body,
        }),
      onSuccess: invalidate,
    }),
    save: useMutation({
      mutationFn: (body: SaveWorkPlanInput) =>
        apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan`, {
          method: 'PUT',
          body,
        }),
      onSuccess: invalidate,
    }),
    start: useMutation({
      mutationFn: (pointId: string) =>
        apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan/points/${pointId}/start`, {
          method: 'POST',
        }),
      onSuccess: invalidate,
    }),
    complete: useMutation({
      mutationFn: (pointId: string) =>
        apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan/points/${pointId}/complete`, {
          method: 'POST',
        }),
      onSuccess: invalidate,
    }),
  };
}
