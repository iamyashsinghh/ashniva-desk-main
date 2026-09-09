/**
 * Task workflow states (Architecture Plan §11). The state machine itself lives in the API
 * (tasks module, task-workflow.ts); this file is the single list of states, labels and the
 * allowed transitions shared by API and UI.
 *
 * Phase 1 uses the short MVP workflow approved for the MVP:
 *   ASSIGNED → IN_PROGRESS → IN_REVIEW (review / testing) → COMPLETED
 * with BLOCKED, RETURNED_TO_DEV (review rejected), REOPENED and CANCELLED as side states.
 * The remaining states belong to the full release pipeline (Phase 2) and are kept here so the
 * database enum does not change between phases.
 */
export const TASK_STATUS = {
  DRAFT: 'DRAFT',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  DEV_COMPLETED: 'DEV_COMPLETED',
  CODE_REVIEW: 'CODE_REVIEW',
  READY_FOR_QA: 'READY_FOR_QA',
  TESTING_STAGING: 'TESTING_STAGING',
  QA_PASSED: 'QA_PASSED',
  CLIENT_UAT: 'CLIENT_UAT',
  READY_TO_PUBLISH: 'READY_TO_PUBLISH',
  PUBLISHED_LIVE: 'PUBLISHED_LIVE',
  LIVE_VERIFICATION: 'LIVE_VERIFICATION',
  COMPLETED: 'COMPLETED',
  QA_FAILED: 'QA_FAILED',
  RETURNED_TO_DEV: 'RETURNED_TO_DEV',
  FIX_SUBMITTED: 'FIX_SUBMITTED',
  LIVE_FAILED: 'LIVE_FAILED',
  ROLLBACK_REQUIRED: 'ROLLBACK_REQUIRED',
  BLOCKED: 'BLOCKED',
  REOPENED: 'REOPENED',
  CANCELLED: 'CANCELLED',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const ALL_TASK_STATUSES: readonly TaskStatus[] = Object.values(TASK_STATUS);

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  DRAFT: 'Draft',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'Review / testing',
  DEV_COMPLETED: 'Development completed',
  CODE_REVIEW: 'Code review',
  READY_FOR_QA: 'Ready for QA',
  TESTING_STAGING: 'Testing on staging',
  QA_PASSED: 'QA passed',
  CLIENT_UAT: 'Client UAT',
  READY_TO_PUBLISH: 'Ready to publish',
  PUBLISHED_LIVE: 'Published live',
  LIVE_VERIFICATION: 'Live verification',
  COMPLETED: 'Completed',
  QA_FAILED: 'QA failed',
  RETURNED_TO_DEV: 'Returned to developer',
  FIX_SUBMITTED: 'Fix submitted',
  LIVE_FAILED: 'Live verification failed',
  ROLLBACK_REQUIRED: 'Rollback / hotfix required',
  BLOCKED: 'Blocked',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

/** States a task can be in during Phase 1 (the MVP workflow). Order is the board column order. */
export const PHASE1_TASK_STATUSES: readonly TaskStatus[] = [
  TASK_STATUS.DRAFT,
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.IN_REVIEW,
  TASK_STATUS.RETURNED_TO_DEV,
  TASK_STATUS.BLOCKED,
  TASK_STATUS.REOPENED,
  TASK_STATUS.COMPLETED,
  TASK_STATUS.CANCELLED,
];

/**
 * Allowed status transitions for the Phase 1 workflow. The API refuses anything else with a
 * 409 and a human-readable reason; the UI uses the same map to decide which action buttons to
 * show. Who may perform a transition is decided by the API (task-workflow.ts), not here.
 */
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  DRAFT: [TASK_STATUS.ASSIGNED, TASK_STATUS.CANCELLED],
  ASSIGNED: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.BLOCKED, TASK_STATUS.CANCELLED],
  IN_PROGRESS: [TASK_STATUS.IN_REVIEW, TASK_STATUS.BLOCKED, TASK_STATUS.CANCELLED],
  IN_REVIEW: [TASK_STATUS.COMPLETED, TASK_STATUS.RETURNED_TO_DEV, TASK_STATUS.CANCELLED],
  RETURNED_TO_DEV: [
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.IN_REVIEW,
    TASK_STATUS.BLOCKED,
    TASK_STATUS.CANCELLED,
  ],
  BLOCKED: [TASK_STATUS.ASSIGNED, TASK_STATUS.IN_PROGRESS, TASK_STATUS.CANCELLED],
  REOPENED: [
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.IN_REVIEW,
    TASK_STATUS.BLOCKED,
    TASK_STATUS.CANCELLED,
  ],
  COMPLETED: [TASK_STATUS.REOPENED],
  CANCELLED: [],
  // Full release pipeline — Phase 2. No transitions until that phase enables them.
  DEV_COMPLETED: [],
  CODE_REVIEW: [],
  READY_FOR_QA: [],
  TESTING_STAGING: [],
  QA_PASSED: [],
  CLIENT_UAT: [],
  READY_TO_PUBLISH: [],
  PUBLISHED_LIVE: [],
  LIVE_VERIFICATION: [],
  QA_FAILED: [],
  FIX_SUBMITTED: [],
  LIVE_FAILED: [],
  ROLLBACK_REQUIRED: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

/**
 * The intended happy path for DEVELOPMENT-kind tasks in the full pipeline.
 *
 * **Not reachable in the current state machine.** Every status between DEV_COMPLETED and
 * LIVE_VERIFICATION has an empty entry in `TASK_TRANSITIONS`, so nothing can enter or leave one:
 * they are reserved names for a pipeline the task workflow does not yet implement. Tasks move
 * along `PHASE1_TASK_HAPPY_PATH`, and that is what the task detail screen draws.
 *
 * Kept because it is the agreed shape of the pipeline and the release package is written against
 * it — but do not render a step strip from it. A strip whose steps nothing can ever reach tells a
 * developer their task is stuck when it is simply not on that path.
 */
export const DEVELOPMENT_TASK_HAPPY_PATH: readonly TaskStatus[] = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.DEV_COMPLETED,
  TASK_STATUS.CODE_REVIEW,
  TASK_STATUS.READY_FOR_QA,
  TASK_STATUS.TESTING_STAGING,
  TASK_STATUS.QA_PASSED,
  TASK_STATUS.CLIENT_UAT,
  TASK_STATUS.READY_TO_PUBLISH,
  TASK_STATUS.PUBLISHED_LIVE,
  TASK_STATUS.LIVE_VERIFICATION,
  TASK_STATUS.COMPLETED,
];

/** Phase 1 happy path, shown as the step strip on the task detail screen. */
export const PHASE1_TASK_HAPPY_PATH: readonly TaskStatus[] = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.IN_REVIEW,
  TASK_STATUS.COMPLETED,
];

/** Short path for management-kind tasks (no code review, QA or release). */
export const MANAGEMENT_TASK_PATH: readonly TaskStatus[] = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.COMPLETED,
];

export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = [
  TASK_STATUS.COMPLETED,
  TASK_STATUS.CANCELLED,
];

/** Statuses that count as "open work" for dashboards and overdue calculations. */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ALL_TASK_STATUSES.filter(
  (status) => !CLOSED_TASK_STATUSES.includes(status),
);

/** Statuses in which a reviewer or tester must act. */
export const REVIEW_TASK_STATUSES: readonly TaskStatus[] = [TASK_STATUS.IN_REVIEW];

export function isTaskClosed(status: TaskStatus): boolean {
  return CLOSED_TASK_STATUSES.includes(status);
}
