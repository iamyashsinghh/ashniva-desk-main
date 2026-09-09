import type {
  ProjectDetail,
  ProjectMemberRole,
  ProjectPlan,
  ProjectStatus,
  ProjectSummary,
  ProjectType,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const projectKeys = {
  all: ['projects'] as const,
  list: (params: ProjectListParams) => ['projects', 'list', params] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  plan: (id: string) => ['projects', 'plan', id] as const,
};

export interface ProjectListParams {
  status?: ProjectStatus;
  clientOrganizationId?: string;
  search?: string;
  mine?: boolean;
}

/** `enabled` lets screens skip the request for people without project:read (no 403 noise). */
export function useProjectsQuery(params: ProjectListParams = {}, enabled = true) {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: () => apiRequest<ProjectSummary[]>('/projects', { query: { ...params } }),
    enabled,
  });
}

export function useProjectQuery(id: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? ''),
    queryFn: () => apiRequest<ProjectDetail>(`/projects/${id}`),
    enabled: Boolean(id),
  });
}

/** Its own request: the plan reads milestones and grouped task counts the detail does not. */
export function useProjectPlanQuery(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: projectKeys.plan(id ?? ''),
    queryFn: () => apiRequest<ProjectPlan>(`/projects/${id}/plan`),
    enabled: Boolean(id) && enabled,
  });
}

export interface ProjectInput {
  code: string;
  name: string;
  description?: string;
  type: ProjectType;
  status?: ProjectStatus;
  clientOrganizationId?: string | null;
  managerUserId?: string | null;
  leadUserId?: string | null;
  teamId?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  requiresClientUat?: boolean;
  members?: Array<{ userId: string; role: ProjectMemberRole }>;
}

export function useProjectMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: projectKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  return {
    create: useMutation({
      mutationFn: (body: ProjectInput) =>
        apiRequest<ProjectDetail>('/projects', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (body: Partial<ProjectInput>) =>
        apiRequest<ProjectDetail>(`/projects/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    setMembers: useMutation({
      mutationFn: (members: NonNullable<ProjectInput['members']>) =>
        apiRequest<ProjectDetail>(`/projects/${id}/members`, { method: 'PUT', body: { members } }),
      onSuccess: invalidate,
    }),
  };
}
