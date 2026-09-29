import {
  WORK_PLAN_POINT_STATUS,
  type ProjectWorkPlan,
  type WorkPlanPoint,
  type WorkPlanPointStatus,
  type WorkPlanTitle,
} from '@ashniva/types';

import type { IconName, IconTone } from '../../../shared/components/Icon';
import type { PillTone } from '../../../shared/components/primitives';

/**
 * Reading a work plan for the phone: progress, clocks and which step buttons to draw.
 *
 * Nothing here decides what a person may do. The API computes `canStart`, `canPass` and the rest
 * per point (with `workPlanPointActions` from `@ashniva/types`) for whoever asked; this file only
 * turns those answers into a list of buttons and the clock into words.
 */

export type PointActionKey = 'start' | 'submitTest' | 'startTest' | 'complete' | 'return';

type ActionFlags = Pick<
  WorkPlanPoint,
  'canStart' | 'canSubmitTest' | 'canStartTest' | 'canPass' | 'canFail'
>;

/** The step buttons for one point, in the order the developer → tester loop runs. */
export function visiblePointActions(point: ActionFlags): PointActionKey[] {
  const actions: PointActionKey[] = [];
  if (point.canStart) {
    actions.push('start');
  }
  if (point.canSubmitTest) {
    actions.push('submitTest');
  }
  if (point.canStartTest) {
    actions.push('startTest');
  }
  if (point.canPass) {
    actions.push('complete');
  }
  if (point.canFail) {
    actions.push('return');
  }
  return actions;
}

export function allPoints(plan: ProjectWorkPlan | null | undefined): WorkPlanPoint[] {
  return (plan?.phases ?? []).flatMap((phase) => phase.titles.flatMap((title) => title.points));
}

/** A clock is running somewhere: the plan is polled so testers and leads see it move. */
export function hasRunningTimer(plan: ProjectWorkPlan | null | undefined): boolean {
  return allPoints(plan).some((point) => Boolean(point.startedAt) && !point.completedAt);
}

/** Once anyone has started, the server refuses a PDF that would replace the plan. */
export function hasStartedWork(plan: ProjectWorkPlan | null | undefined): boolean {
  return allPoints(plan).some((point) => Boolean(point.startedAt));
}

export interface PlanProgress {
  total: number;
  done: number;
  percent: number;
  running: number;
  overdue: number;
}

/** Tester-error rows are follow-ups on a step, not steps of their own, so they are not counted. */
export function planProgress(plan: ProjectWorkPlan | null | undefined): PlanProgress {
  const steps = allPoints(plan).filter((point) => !point.isError);
  const done = steps.filter((point) => point.status === WORK_PLAN_POINT_STATUS.COMPLETED).length;
  return {
    total: steps.length,
    done,
    percent: steps.length === 0 ? 0 : Math.round((done / steps.length) * 100),
    running: steps.filter((point) => point.startedAt && !point.completedAt && !point.timerPaused)
      .length,
    overdue: steps.filter((point) => point.overdue && !point.completedAt).length,
  };
}

export function titleEstimateMinutes(title: Pick<WorkPlanTitle, 'points'>): number {
  return title.points
    .filter((point) => !point.isError)
    .reduce((sum, point) => sum + point.estimateMinutes, 0);
}

/** Only untouched topics can be merged: combining started work would rewrite its clock. */
export function titleIsCombinable(title: Pick<WorkPlanTitle, 'points'>): boolean {
  return (
    title.points.length > 0 &&
    title.points.every(
      (point) =>
        !point.isError && !point.startedAt && point.status === WORK_PLAN_POINT_STATUS.PENDING,
    )
  );
}

export function showsTimer(
  point: Pick<WorkPlanPoint, 'startedAt' | 'completedAt' | 'isError'>,
): boolean {
  return Boolean(point.startedAt) && !point.completedAt && !point.isError;
}

/**
 * Seconds left, recomputed locally between polls.
 *
 * A frozen clock (with the tester, or returned) shows the server's leftover as sent; a running one
 * counts down to `dueAt` so the display moves every second without a request.
 */
export function liveRemainingSeconds(
  point: Pick<WorkPlanPoint, 'dueAt' | 'completedAt' | 'remainingSeconds' | 'timerPaused'>,
  nowMs: number,
): number {
  if (point.completedAt) {
    return 0;
  }
  if (point.timerPaused || !point.dueAt) {
    return Math.max(0, point.remainingSeconds);
  }
  return Math.max(0, Math.floor((new Date(point.dueAt).getTime() - nowMs) / 1000));
}

export type TimerTone = 'running' | 'paused' | 'late';

export function timerLabel(
  point: Pick<WorkPlanPoint, 'overdue' | 'timerPaused'>,
  remaining: number,
): { text: string; tone: TimerTone } {
  if (remaining === 0 || point.overdue) {
    return { text: point.timerPaused ? 'Paused · Overdue' : 'Overdue', tone: 'late' };
  }
  const clock = formatClock(remaining);
  return point.timerPaused
    ? { text: `Paused · ${clock}`, tone: 'paused' }
    : { text: clock, tone: 'running' };
}

/** A countdown: "4:05", or "1:02:09" once it runs past an hour. */
export function formatClock(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = String(safe % 60).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

/** A span somebody reads rather than watches: "45s", "3m 20s", "12m", "2h 5m". */
export function formatSpan(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return seconds === 0 || minutes >= 10 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function pointStatusTone(status: WorkPlanPointStatus): PillTone {
  return STATUS_TONES[status];
}

export function pointStatusIcon(point: Pick<WorkPlanPoint, 'status' | 'isError'>): {
  name: IconName;
  tone: IconTone;
} {
  if (point.isError && point.status !== WORK_PLAN_POINT_STATUS.COMPLETED) {
    return { name: 'bug-outline', tone: 'danger' };
  }
  return STATUS_ICONS[point.status];
}

const STATUS_TONES: Record<WorkPlanPointStatus, PillTone> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'progress',
  AWAITING_TEST: 'warning',
  TESTING: 'info',
  RETURNED: 'danger',
  COMPLETED: 'success',
};

const STATUS_ICONS: Record<WorkPlanPointStatus, { name: IconName; tone: IconTone }> = {
  PENDING: { name: 'ellipse-outline', tone: 'neutral' },
  IN_PROGRESS: { name: 'play-circle-outline', tone: 'info' },
  AWAITING_TEST: { name: 'hourglass-outline', tone: 'warning' },
  TESTING: { name: 'flask-outline', tone: 'violet' },
  RETURNED: { name: 'arrow-undo-outline', tone: 'danger' },
  COMPLETED: { name: 'checkmark-circle', tone: 'success' },
};
