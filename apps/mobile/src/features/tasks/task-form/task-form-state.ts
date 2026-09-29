import { PRIORITY, normalizeWorkAreas, type Priority, type TaskDetail } from '@ashniva/types';

/**
 * The create / edit form as plain values, and the two bodies it turns into.
 *
 * Kept free of React so the rules — what is required, what an edit actually changed, what an
 * empty field means — are tested once rather than discovered on a device. Text fields are kept as
 * typed; trimming happens when a body is built, so the cursor does not jump while somebody types.
 */
export interface TaskFormValues {
  title: string;
  description: string;
  projectId: string | null;
  assignedToId: string | null;
  priority: Priority;
  categoryId: string | null;
  /** `YYYY-MM-DD`: the calendar due date the list views filter on. */
  dueDate: string | null;
  /** ISO instants: when work may begin, and when it is expected done (what "on time" measures). */
  scheduledStartAt: string | null;
  dueAt: string | null;
  workAreas: string[];
  module: string;
  /** Minutes, as typed. */
  estimate: string;
  reviewerId: string | null;
  testerId: string | null;
  acceptanceCriteria: string;
  clientVisible: boolean;
}

export type TaskFormErrors = Partial<Record<'title' | 'projectId' | 'estimate', string>>;

export const MAX_ESTIMATE_MINUTES = 100_000;

export function emptyTaskForm(projectId: string | null, today: string): TaskFormValues {
  return {
    title: '',
    description: '',
    projectId,
    assignedToId: null,
    priority: PRIORITY.MEDIUM,
    categoryId: null,
    dueDate: today,
    scheduledStartAt: null,
    dueAt: null,
    workAreas: [],
    module: '',
    estimate: '',
    reviewerId: null,
    testerId: null,
    acceptanceCriteria: '',
    clientVisible: false,
  };
}

export function taskFormFrom(task: TaskDetail): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? '',
    projectId: task.project.id,
    assignedToId: task.assignedTo?.id ?? null,
    priority: task.priority,
    categoryId: task.category?.id ?? null,
    dueDate: task.dueDate,
    scheduledStartAt: task.scheduledStartAt,
    dueAt: task.dueAt,
    workAreas: [...task.workAreas],
    module: task.module ?? '',
    estimate: task.estimateMinutes === null ? '' : String(task.estimateMinutes),
    reviewerId: task.reviewer?.id ?? null,
    testerId: task.tester?.id ?? null,
    acceptanceCriteria: task.acceptanceCriteria ?? '',
    clientVisible: task.clientVisible,
  };
}

/** Minutes from the estimate field: null when empty, NaN when it is not a whole number in range. */
export function parseEstimate(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const minutes = Number(trimmed);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_ESTIMATE_MINUTES
    ? minutes
    : Number.NaN;
}

export function validateTaskForm(values: TaskFormValues, mode: 'create' | 'edit'): TaskFormErrors {
  const errors: TaskFormErrors = {};
  if (values.title.trim().length < 3) {
    errors.title = 'Give the task a title (at least 3 characters)';
  }
  if (mode === 'create' && !values.projectId) {
    errors.projectId = 'Choose a project';
  }
  if (Number.isNaN(parseEstimate(values.estimate))) {
    errors.estimate = `Whole minutes, between 1 and ${MAX_ESTIMATE_MINUTES}`;
  }
  return errors;
}

/** Empty text is simply not sent on create: the API's defaults are the right ones. */
function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export type CreateTaskBody = Record<string, string | number | boolean | string[]>;

export function toCreateBody(values: TaskFormValues, saveAsDraft: boolean): CreateTaskBody {
  const fields: Record<string, string | number | boolean | string[] | null | undefined> = {
    title: values.title.trim(),
    projectId: values.projectId,
    description: optionalText(values.description),
    assignedToId: values.assignedToId,
    priority: values.priority,
    categoryId: values.categoryId,
    dueDate: values.dueDate,
    scheduledStartAt: values.scheduledStartAt,
    dueAt: values.dueAt,
    workAreas: values.workAreas.length > 0 ? normalizeWorkAreas(values.workAreas) : undefined,
    module: optionalText(values.module),
    estimateMinutes: parseEstimate(values.estimate),
    reviewerId: values.reviewerId,
    testerId: values.testerId,
    acceptanceCriteria: optionalText(values.acceptanceCriteria),
    clientVisible: values.clientVisible,
    saveAsDraft,
  };
  const body: CreateTaskBody = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) {
      body[key] = value;
    }
  }
  return body;
}

export type PatchTaskBody = Record<string, string | number | boolean | string[] | null>;

/**
 * Only what changed, with `null` meaning "clear it".
 *
 * Sending the whole form would stamp an edit on fields nobody touched, and would race a colleague
 * editing another field of the same task. Project and assignee are never here: the API does not
 * move a task between projects, and reassigning is its own audited action.
 */
export function toPatchBody(before: TaskFormValues, after: TaskFormValues): PatchTaskBody {
  const body: PatchTaskBody = {};
  const text = (key: string, from: string, to: string, clearable: boolean) => {
    if (from.trim() !== to.trim()) {
      body[key] = to.trim() === '' && clearable ? null : to.trim();
    }
  };
  const ref = (key: string, from: string | null, to: string | null) => {
    if (from !== to) {
      body[key] = to;
    }
  };

  text('title', before.title, after.title, false);
  text('description', before.description, after.description, true);
  text('module', before.module, after.module, true);
  text('acceptanceCriteria', before.acceptanceCriteria, after.acceptanceCriteria, true);
  ref('categoryId', before.categoryId, after.categoryId);
  ref('dueDate', before.dueDate, after.dueDate);
  ref('scheduledStartAt', before.scheduledStartAt, after.scheduledStartAt);
  ref('dueAt', before.dueAt, after.dueAt);
  ref('reviewerId', before.reviewerId, after.reviewerId);
  ref('testerId', before.testerId, after.testerId);
  if (before.priority !== after.priority) {
    body.priority = after.priority;
  }
  if (before.clientVisible !== after.clientVisible) {
    body.clientVisible = after.clientVisible;
  }
  const estimateBefore = parseEstimate(before.estimate);
  const estimateAfter = parseEstimate(after.estimate);
  if (estimateBefore !== estimateAfter) {
    body.estimateMinutes = estimateAfter;
  }
  const areasAfter = normalizeWorkAreas(after.workAreas);
  if (normalizeWorkAreas(before.workAreas).join('\n') !== areasAfter.join('\n')) {
    body.workAreas = areasAfter;
  }
  return body;
}
