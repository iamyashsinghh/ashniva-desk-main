import type {
  CommentSummary,
  PaginatedResponse,
  Priority,
  TaskDetail,
  TaskListView,
  TaskStatus,
  TaskSummary,
  Visibility,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface TaskListParams {
  view?: TaskListView;
  status?: TaskStatus[];
  /** Narrows any view to open, past-due tasks — how dashboard cards link to what they counted. */
  overdue?: boolean;
  completedToday?: boolean;
  /** Open work scheduled to start today — the operational dashboard's "Scheduled" card. */
  scheduledToday?: boolean;
  /** Work actually begun today, whatever became of it since. */
  startedToday?: boolean;
  /** Open work whose scheduled start is still ahead. */
  upcoming?: boolean;
  projectId?: string;
  assignedToId?: string;
  priority?: Priority;
  search?: string;
  limit?: number;
  cursor?: string;
}

export const taskKeys = {
  all: ['tasks'] as const,
  list: (params: TaskListParams) => ['tasks', 'list', params] as const,
  detail: (id: string) => ['tasks', 'detail', id] as const,
};

export function fetchTasks(params: TaskListParams): Promise<PaginatedResponse<TaskSummary>> {
  return apiRequest('/tasks', {
    query: {
      view: params.view,
      status: params.status?.join(','),
      overdue: params.overdue,
      completedToday: params.completedToday,
      scheduledToday: params.scheduledToday,
      startedToday: params.startedToday,
      upcoming: params.upcoming,
      projectId: params.projectId,
      assignedToId: params.assignedToId,
      priority: params.priority,
      search: params.search,
      limit: params.limit ?? 100,
      cursor: params.cursor,
    },
  });
}

export function useTasksQuery(params: TaskListParams, enabled = true) {
  return useQuery({ queryKey: taskKeys.list(params), queryFn: () => fetchTasks(params), enabled });
}

export function useTaskQuery(id: string | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(id ?? ''),
    queryFn: () => apiRequest<TaskDetail>(`/tasks/${id}`),
    enabled: Boolean(id),
  });
}

export interface CreateTaskInput {
  title: string;
  projectId?: string;
  description?: string;
  assignedToId?: string;
  priority?: Priority;
  categoryId?: string;
  dueDate?: string;
  /** When the work is meant to begin; until then the task waits in Upcoming. */
  scheduledStartAt?: string;
  /** Expected completion as an instant — what the on-time/delayed badge measures against. */
  dueAt?: string;
  workAreas?: string[];
  module?: string;
  estimateMinutes?: number;
  reviewerId?: string;
  testerId?: string;
  acceptanceCriteria?: string;
  clientVisible?: boolean;
  saveAsDraft?: boolean;
  ticketId?: string;
  milestoneId?: string;
  /** Learning work for an intern. */
  isInternTask?: boolean;
}

/**
 * What `PATCH /tasks/:id` accepts.
 *
 * Separate from `CreateTaskInput` rather than `Partial<>` of it, because the two differ in a way
 * that matters: on an edit, `null` means "clear this" and an absent key means "leave it alone".
 * A `Partial<CreateTaskInput>` cannot express the first, and a component that wants to clear a
 * reviewer would have to lie to the type system to do it.
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: Priority;
  categoryId?: string | null;
  dueDate?: string | null;
  scheduledStartAt?: string | null;
  dueAt?: string | null;
  workAreas?: string[];
  module?: string | null;
  estimateMinutes?: number | null;
  reviewerId?: string | null;
  testerId?: string | null;
  acceptanceCriteria?: string | null;
  clientVisible?: boolean;
  milestoneId?: string | null;
}

export interface SubmitTaskInput {
  summary: string;
  minutes: number;
  workDate?: string;
  proofUrl?: string;
  gitRef?: string;
  fileIds?: string[];
  clientVisible?: boolean;
  clientSummary?: string;
}

export interface LogWorkInput {
  workDate: string;
  minutes: number;
  summary: string;
  proofUrl?: string;
  gitRef?: string;
}

/** Every task write goes through here so cache invalidation happens in one place. */
export function useTaskMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: taskKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    await queryClient.invalidateQueries({ queryKey: ['client-updates'] });
    await queryClient.invalidateQueries({ queryKey: ['reports'] });
  };
  const useAction = <TBody>(action: string) =>
    useMutation({
      mutationFn: (body: TBody) =>
        apiRequest<TaskDetail>(`/tasks/${id}/${action}`, { method: 'POST', body }),
      onSuccess: invalidate,
    });

  return {
    create: useMutation({
      mutationFn: (body: CreateTaskInput) =>
        apiRequest<TaskDetail>('/tasks', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (body: UpdateTaskInput) =>
        apiRequest<TaskDetail>(`/tasks/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    assign: useAction<{ assignedToId: string; note?: string }>('assign'),
    start: useAction<Record<string, never>>('start'),
    block: useAction<{ reason: string }>('block'),
    unblock: useAction<Record<string, never>>('unblock'),
    submit: useAction<SubmitTaskInput>('submit'),
    review: useAction<{ outcome: 'APPROVE' | 'REJECT'; note?: string }>('review'),
    reopen: useAction<{ reason: string }>('reopen'),
    cancel: useAction<{ reason: string }>('cancel'),
    logWork: useAction<LogWorkInput>('work-logs'),
    comment: useMutation({
      mutationFn: (body: { body: string; visibility: Visibility }) =>
        apiRequest<CommentSummary>(`/tasks/${id}/comments`, { method: 'POST', body }),
      onSuccess: invalidate,
    }),
  };
}
