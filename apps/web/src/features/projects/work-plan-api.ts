import type {
  AddWorkPlanWorkInput,
  AssignWorkPlanInput,
  CombineWorkPlanTitlesInput,
  DecideWorkPlanProposalInput,
  ParseWorkPlanInput,
  ProjectDoc,
  ProjectWorkPlan,
  SaveWorkPlanAssignmentsInput,
  SaveWorkPlanInput,
  UpdateWorkPlanProposalInput,
  WorkPlanProposal,
  WorkPlanExplainApplyInput,
  WorkPlanExplainPreview,
  WorkPlanExplainPreviewInput,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';
import { taskKeys } from '../tasks/api';
import { projectKeys } from './api';

export const workPlanKeys = {
  detail: (projectId: string) => [...projectKeys.detail(projectId), 'work-plan'] as const,
  proposals: (projectId: string) =>
    [...projectKeys.detail(projectId), 'work-plan', 'proposals'] as const,
  doc: (projectId: string) => [...projectKeys.detail(projectId), 'work-plan', 'doc'] as const,
};

export function useWorkPlanProposalsQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: workPlanKeys.proposals(projectId ?? ''),
    queryFn: () =>
      apiRequest<WorkPlanProposal[]>(`/projects/${projectId}/work-plan/proposals?status=PENDING`),
    enabled: Boolean(projectId),
    refetchInterval: 30_000,
  });
}

export function useProjectDocQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: workPlanKeys.doc(projectId ?? ''),
    queryFn: () => apiRequest<ProjectDoc>(`/projects/${projectId}/work-plan/doc`),
    enabled: Boolean(projectId) && enabled,
    refetchInterval: (query) => (query.state.data?.refreshing ? 4_000 : false),
  });
}

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
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: workPlanKeys.detail(projectId) });
  const invalidateProposals = () =>
    queryClient.invalidateQueries({ queryKey: workPlanKeys.proposals(projectId) });
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
    submitTest: useMutation({
      mutationFn: (pointId: string) =>
        apiRequest<ProjectWorkPlan>(
          `/projects/${projectId}/work-plan/points/${pointId}/submit-test`,
          { method: 'POST' },
        ),
      onSuccess: invalidate,
    }),
    startTest: useMutation({
      mutationFn: (pointId: string) =>
        apiRequest<ProjectWorkPlan>(
          `/projects/${projectId}/work-plan/points/${pointId}/start-test`,
          { method: 'POST' },
        ),
      onSuccess: invalidate,
    }),
    complete: useMutation({
      mutationFn: (pointId: string) =>
        apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan/points/${pointId}/complete`, {
          method: 'POST',
        }),
      onSuccess: invalidate,
    }),
    fail: useMutation({
      mutationFn: (input: { pointId: string; body: string; fileId?: string }) =>
        apiRequest<ProjectWorkPlan>(
          `/projects/${projectId}/work-plan/points/${input.pointId}/return`,
          { method: 'POST', body: { body: input.body, fileId: input.fileId } },
        ),
      onSuccess: async () => {
        await invalidate();
        await queryClient.invalidateQueries({ queryKey: taskKeys.all });
      },
    }),
    addNote: useMutation({
      mutationFn: (input: { pointId: string; body: string }) =>
        apiRequest<ProjectWorkPlan>(
          `/projects/${projectId}/work-plan/points/${input.pointId}/notes`,
          { method: 'POST', body: { body: input.body } },
        ),
      onSuccess: invalidate,
    }),
    reply: useMutation({
      mutationFn: (input: { pointId: string; noteId: string; body: string }) =>
        apiRequest<ProjectWorkPlan>(
          `/projects/${projectId}/work-plan/points/${input.pointId}/notes/${input.noteId}/replies`,
          { method: 'POST', body: { body: input.body } },
        ),
      onSuccess: invalidate,
    }),
    assign: useMutation({
      mutationFn: (body: AssignWorkPlanInput) =>
        apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan/assign`, {
          method: 'POST',
          body,
        }),
      onSuccess: invalidate,
    }),
    saveAssignments: useMutation({
      mutationFn: (body: SaveWorkPlanAssignmentsInput) =>
        apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan/assignments`, {
          method: 'PUT',
          body,
        }),
      onSuccess: invalidate,
    }),
    explainPreview: useMutation({
      mutationFn: (body: WorkPlanExplainPreviewInput & { attempt?: number }) =>
        apiRequest<WorkPlanExplainPreview>(`/projects/${projectId}/work-plan/explain-preview`, {
          method: 'POST',
          body,
        }),
    }),
    explainApply: useMutation({
      mutationFn: (body: WorkPlanExplainApplyInput) =>
        apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan/explain-apply`, {
          method: 'POST',
          body,
        }),
      onSuccess: invalidate,
    }),
    addWork: useMutation({
      mutationFn: (body: AddWorkPlanWorkInput) =>
        apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan/add-work`, {
          method: 'POST',
          body,
        }),
      onSuccess: invalidate,
    }),
    updateProposal: useMutation({
      mutationFn: (input: { id: string; body: UpdateWorkPlanProposalInput }) =>
        apiRequest<WorkPlanProposal>(`/projects/${projectId}/work-plan/proposals/${input.id}`, {
          method: 'PATCH',
          body: input.body,
        }),
      onSuccess: invalidateProposals,
    }),
    publishProposal: useMutation({
      mutationFn: (input: {
        id: string;
        body: UpdateWorkPlanProposalInput & DecideWorkPlanProposalInput;
      }) =>
        apiRequest<{ proposal: WorkPlanProposal; plan: ProjectWorkPlan }>(
          `/projects/${projectId}/work-plan/proposals/${input.id}/publish`,
          { method: 'POST', body: input.body },
        ),
      onSuccess: async () => {
        await invalidateProposals();
        await invalidate();
        await queryClient.invalidateQueries({ queryKey: taskKeys.all });
      },
    }),
    rejectProposal: useMutation({
      mutationFn: (input: { id: string; body: DecideWorkPlanProposalInput }) =>
        apiRequest<WorkPlanProposal>(
          `/projects/${projectId}/work-plan/proposals/${input.id}/reject`,
          { method: 'POST', body: input.body },
        ),
      onSuccess: invalidateProposals,
    }),
    refreshDoc: useMutation({
      mutationFn: () =>
        apiRequest<ProjectDoc>(`/projects/${projectId}/work-plan/doc/refresh`, {
          method: 'POST',
        }),
      onSuccess: (doc) => queryClient.setQueryData(workPlanKeys.doc(projectId), doc),
    }),
    combineTitles: useMutation({
      mutationFn: (body: CombineWorkPlanTitlesInput) =>
        apiRequest<ProjectWorkPlan>(`/projects/${projectId}/work-plan/combine-titles`, {
          method: 'POST',
          body,
        }),
      onSuccess: async () => {
        await invalidate();
        await queryClient.invalidateQueries({ queryKey: taskKeys.all });
      },
    }),
  };
}
