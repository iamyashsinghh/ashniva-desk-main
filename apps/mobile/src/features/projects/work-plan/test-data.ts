import {
  PRIORITY,
  WORK_PLAN_POINT_STATUS,
  type ProjectWorkPlan,
  type WorkPlanPoint,
} from '@ashniva/types';

/** Fixtures for the work-plan tests. Imported only by `*.test.ts(x)`. */

export function testPoint(overrides: Partial<WorkPlanPoint> = {}): WorkPlanPoint {
  return {
    id: 'pt1',
    body: 'Build the login form',
    estimateMinutes: 30,
    sortOrder: 0,
    status: WORK_PLAN_POINT_STATUS.PENDING,
    isError: false,
    parentPointId: null,
    startedAt: null,
    assignedAt: null,
    dueAt: null,
    completedAt: null,
    remainingSeconds: 0,
    overdue: false,
    pausedRemainingSeconds: null,
    timerPaused: false,
    overrunSeconds: 0,
    extraSeconds: 0,
    events: [],
    startedBy: null,
    notes: [],
    canStart: false,
    canSubmitTest: false,
    canStartTest: false,
    canPass: false,
    canFail: false,
    canDoubt: false,
    canReply: false,
    ...overrides,
  };
}

export function testPlan(
  points: WorkPlanPoint[],
  overrides: Partial<ProjectWorkPlan> = {},
): ProjectWorkPlan {
  return {
    projectId: 'p1',
    source: null,
    sourceFile: null,
    assignedTo: null,
    assignedAt: null,
    priority: PRIORITY.MEDIUM,
    developers: [],
    scores: [],
    canManage: false,
    canWork: false,
    canAssign: false,
    canExplainWithAi: false,
    phases: [
      {
        id: 'ph1',
        heading: 'Authentication',
        sortOrder: 0,
        assignedTo: null,
        assignedAt: null,
        priority: null,
        effectivePriority: PRIORITY.MEDIUM,
        titles: [
          {
            id: 't1',
            title: 'Login',
            sortOrder: 0,
            assignedTo: null,
            effectiveAssignedTo: null,
            assignedAt: null,
            priority: null,
            effectivePriority: PRIORITY.MEDIUM,
            points,
          },
        ],
      },
    ],
    ...overrides,
  };
}
