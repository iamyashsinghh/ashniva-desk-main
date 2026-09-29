import {
  PRIORITY,
  WORK_PLAN_POINT_STATUS,
  workPlanPointActions,
  type ProjectWorkPlan,
  type WorkPlanPoint,
} from '@ashniva/types';

import {
  formatClock,
  formatSpan,
  hasRunningTimer,
  hasStartedWork,
  liveRemainingSeconds,
  planProgress,
  timerLabel,
  titleIsCombinable,
  visiblePointActions,
} from './plan-helpers';

function point(overrides: Partial<WorkPlanPoint> = {}): WorkPlanPoint {
  return {
    id: 'p1',
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

function plan(points: WorkPlanPoint[]): ProjectWorkPlan {
  return {
    projectId: 'project',
    source: null,
    sourceFile: null,
    assignedTo: null,
    assignedAt: null,
    priority: PRIORITY.MEDIUM,
    developers: [],
    scores: [],
    canManage: true,
    canWork: false,
    canAssign: true,
    canExplainWithAi: false,
    phases: [
      {
        id: 'phase',
        heading: 'Phase 1',
        sortOrder: 0,
        assignedTo: null,
        assignedAt: null,
        priority: null,
        effectivePriority: PRIORITY.MEDIUM,
        titles: [
          {
            id: 'title',
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
  };
}

describe('formatClock', () => {
  it('shows minutes and padded seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(245)).toBe('4:05');
  });

  it('adds hours past sixty minutes', () => {
    expect(formatClock(3729)).toBe('1:02:09');
  });

  it('never shows a negative clock', () => {
    expect(formatClock(-10)).toBe('0:00');
  });
});

describe('formatSpan', () => {
  it('reads coarsely, as the web lead log does', () => {
    expect(formatSpan(45)).toBe('45s');
    expect(formatSpan(200)).toBe('3m 20s');
    expect(formatSpan(720)).toBe('12m');
    expect(formatSpan(7500)).toBe('2h 5m');
    expect(formatSpan(7200)).toBe('2h');
  });
});

describe('the countdown between polls', () => {
  const now = Date.parse('2026-09-28T10:00:00Z');

  it('counts down to dueAt while the clock runs', () => {
    const running = point({ dueAt: '2026-09-28T10:05:00Z', remainingSeconds: 999 });
    expect(liveRemainingSeconds(running, now)).toBe(300);
  });

  it('holds the server leftover while paused with the tester', () => {
    const paused = point({
      dueAt: '2026-09-28T10:05:00Z',
      timerPaused: true,
      remainingSeconds: 42,
    });
    expect(liveRemainingSeconds(paused, now)).toBe(42);
  });

  it('is zero once done', () => {
    expect(liveRemainingSeconds(point({ completedAt: '2026-09-28T09:00:00Z' }), now)).toBe(0);
  });

  it('labels paused and overdue clocks', () => {
    expect(timerLabel(point({ timerPaused: true }), 65)).toEqual({
      text: 'Paused · 1:05',
      tone: 'paused',
    });
    expect(timerLabel(point(), 0)).toEqual({ text: 'Overdue', tone: 'late' });
    expect(timerLabel(point({ overdue: true, timerPaused: true }), 30).text).toBe(
      'Paused · Overdue',
    );
  });
});

describe('which step buttons are drawn', () => {
  it('draws exactly the flags the API returned, in loop order', () => {
    expect(
      visiblePointActions(point({ canPass: true, canFail: true, canStartTest: true })),
    ).toEqual(['startTest', 'complete', 'return']);
    expect(visiblePointActions(point())).toEqual([]);
  });

  it('matches the shared rule for a developer on a started point', () => {
    const flags = workPlanPointActions({
      status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
      startedById: 'dev',
      actorId: 'dev',
      canWork: true,
      canTest: false,
      canLead: false,
      assignedToId: 'dev',
    });
    expect(visiblePointActions(flags)).toEqual(['submitTest']);
  });

  it('gives a tester Good and Error once the point is sent', () => {
    const flags = workPlanPointActions({
      status: WORK_PLAN_POINT_STATUS.AWAITING_TEST,
      startedById: 'dev',
      actorId: 'tester',
      canWork: false,
      canTest: true,
      canLead: false,
    });
    expect(visiblePointActions(flags)).toEqual(['startTest', 'complete', 'return']);
  });
});

describe('reading the plan', () => {
  it('polls only while a clock runs', () => {
    expect(hasRunningTimer(plan([point()]))).toBe(false);
    expect(hasRunningTimer(plan([point({ startedAt: '2026-09-28T09:00:00Z' })]))).toBe(true);
    expect(
      hasRunningTimer(
        plan([point({ startedAt: '2026-09-28T09:00:00Z', completedAt: '2026-09-28T09:30:00Z' })]),
      ),
    ).toBe(false);
    expect(hasRunningTimer(undefined)).toBe(false);
  });

  it('locks the PDF once anyone has started', () => {
    expect(hasStartedWork(plan([point()]))).toBe(false);
    expect(hasStartedWork(plan([point({ startedAt: '2026-09-28T09:00:00Z' })]))).toBe(true);
  });

  it('counts progress without tester-error rows', () => {
    const progress = planProgress(
      plan([
        point({ id: 'a', status: WORK_PLAN_POINT_STATUS.COMPLETED }),
        point({ id: 'b' }),
        point({ id: 'c', isError: true }),
      ]),
    );
    expect(progress).toMatchObject({ total: 2, done: 1, percent: 50 });
  });

  it('only offers untouched topics for combining', () => {
    expect(titleIsCombinable({ points: [point()] })).toBe(true);
    expect(titleIsCombinable({ points: [point({ startedAt: '2026-09-28T09:00:00Z' })] })).toBe(
      false,
    );
    expect(titleIsCombinable({ points: [] })).toBe(false);
  });
});
