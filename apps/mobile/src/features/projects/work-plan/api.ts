import type {
  AddWorkPlanWorkInput,
  CombineWorkPlanTitlesInput,
  ParseWorkPlanInput,
  ProjectWorkPlan,
  SaveWorkPlanAssignmentsInput,
  SaveWorkPlanInput,
  WorkPlanExplainApplyInput,
  WorkPlanExplainPreview,
  WorkPlanExplainPreviewInput,
} from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';

import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';
import { hasRunningTimer } from './plan-helpers';

/**
 * `/projects/:projectId/work-plan`, the same endpoints and payloads as the web's
 * `work-plan-api.ts`.
 *
 * Every write answers with the whole plan, so it is put straight into the cache instead of being
 * refetched: the screen shows the server's verdict the moment it lands. Realtime invalidates
 * `['work-plan']` on `task.updated`, which is why the key starts with that segment.
 */

export const WORK_PLAN_KEY = 'work-plan';
const TASKS_KEY = ['tasks'] as const;
const POLL_MS = 5_000;

export function workPlanKey(projectId: string) {
  return [WORK_PLAN_KEY, projectId] as const;
}

export function workPlanPath(projectId: string): string {
  return `/projects/${projectId}/work-plan`;
}

/**
 * The plan, polled every five seconds while any clock runs — a tester waiting on "Send to tester"
 * sees it arrive without pulling to refresh — and not at all otherwise.
 */
export function useWorkPlan(projectId: string) {
  const queryClient = useQueryClient();
  const key = workPlanKey(projectId);
  const cached = queryClient.getQueryData<ProjectWorkPlan>(key);
  return useResource<ProjectWorkPlan>(key, workPlanPath(projectId), {
    refetchInterval: hasRunningTimer(cached) ? POLL_MS : false,
  });
}

function usePlanWrite<TVariables>(
  projectId: string,
  suffix: (variables: TVariables) => string,
  options: {
    method?: 'POST' | 'PUT';
    body?: (variables: TVariables) => unknown;
    /** A point's linked task changes too: its comments, or the task itself on combine. */
    touchesTasks?: boolean;
  } = {},
) {
  const queryClient = useQueryClient();
  return useApiMutation<TVariables, ProjectWorkPlan>({
    path: (variables) => `${workPlanPath(projectId)}${suffix(variables)}`,
    method: options.method ?? 'POST',
    ...(options.body ? { body: options.body } : {}),
    invalidate: options.touchesTasks ? [TASKS_KEY] : [],
    onSuccess: (plan) => queryClient.setQueryData(workPlanKey(projectId), plan),
  });
}

export interface ReturnPointInput {
  pointId: string;
  body: string;
  fileId?: string;
}

export interface PointNoteInput {
  pointId: string;
  body: string;
}

export interface NoteReplyInput extends PointNoteInput {
  noteId: string;
}

/** The step buttons and the note thread on a point. */
export function usePointWrites(projectId: string) {
  return {
    start: usePlanWrite<string>(projectId, (id) => `/points/${id}/start`),
    submitTest: usePlanWrite<string>(projectId, (id) => `/points/${id}/submit-test`),
    startTest: usePlanWrite<string>(projectId, (id) => `/points/${id}/start-test`),
    complete: usePlanWrite<string>(projectId, (id) => `/points/${id}/complete`),
    fail: usePlanWrite<ReturnPointInput>(projectId, (v) => `/points/${v.pointId}/return`, {
      body: (v) => ({ body: v.body, ...(v.fileId ? { fileId: v.fileId } : {}) }),
      touchesTasks: true,
    }),
    addNote: usePlanWrite<PointNoteInput>(projectId, (v) => `/points/${v.pointId}/notes`, {
      body: (v) => ({ body: v.body }),
    }),
    reply: usePlanWrite<NoteReplyInput>(
      projectId,
      (v) => `/points/${v.pointId}/notes/${v.noteId}/replies`,
      { body: (v) => ({ body: v.body }) },
    ),
  };
}

/** Saving the plan's shape: by hand, from a PDF, from a sentence, or by merging topics. */
export function usePlanShapeWrites(projectId: string) {
  return {
    save: usePlanWrite<SaveWorkPlanInput>(projectId, () => '', {
      method: 'PUT',
      body: (v) => v,
    }),
    parse: usePlanWrite<ParseWorkPlanInput>(projectId, () => '/parse', { body: (v) => v }),
    addWork: usePlanWrite<AddWorkPlanWorkInput>(projectId, () => '/add-work', {
      body: (v) => v,
    }),
    combineTitles: usePlanWrite<CombineWorkPlanTitlesInput>(projectId, () => '/combine-titles', {
      body: (v) => v,
      touchesTasks: true,
    }),
  };
}

/** Saving who does what, and the optional AI rewrite of the wording that goes with it. */
export function useAssignmentWrites(projectId: string) {
  return {
    saveAssignments: usePlanWrite<SaveWorkPlanAssignmentsInput>(projectId, () => '/assignments', {
      method: 'PUT',
      body: (v) => v,
    }),
    explainApply: usePlanWrite<WorkPlanExplainApplyInput>(projectId, () => '/explain-apply', {
      body: (v) => v,
    }),
    // A preview saves nothing, so it neither touches the cache nor invalidates anything.
    explainPreview: useApiMutation<WorkPlanExplainPreviewInput, WorkPlanExplainPreview>({
      path: `${workPlanPath(projectId)}/explain-preview`,
      body: (v) => v,
    }),
  };
}
