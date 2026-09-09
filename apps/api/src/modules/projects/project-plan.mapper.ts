import {
  MILESTONE_PROGRESS_MODE,
  MILESTONE_STATUS,
  PROJECT_PLAN_ITEM_KIND,
  PROJECT_PROGRESS_BASIS,
  type MilestoneProgressMode,
  type MilestoneStatus,
  type ProjectPlan,
  type ProjectPlanItem,
  type ProjectPlanProgress,
  type ProjectPlanWindow,
  type ProjectRef,
  type TaskCounts,
} from '@ashniva/types';

import { computeProgress, isMilestoneOverdue } from '../milestones/milestones.mapper';
import { progressPercent } from './projects.mapper';
import type { PlanMilestoneRow, PlanTaskGroup } from './project-plan.repository';

/** The bucket for work no milestone claims. Not a row, so it needs a stable key of its own. */
export const UNGROUPED_ITEM_ID = 'ungrouped';

const EMPTY_GROUP: PlanTaskGroup = {
  milestoneId: null,
  total: 0,
  completed: 0,
  overdue: 0,
  earliest: null,
  latest: null,
};

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function min(values: Array<string | null>): string | null {
  return values.filter((value): value is string => value !== null).sort()[0] ?? null;
}

function max(values: Array<string | null>): string | null {
  return (
    values
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null
  );
}

/**
 * A milestone's progress, at read time.
 *
 * AUTO is recomputed here from the deliverables and the linked tasks with the milestone module's
 * own rule, rather than read from `progressPercent`: the stored column is a cache the writers
 * keep up to date, and a plan that has to be right about a date should not depend on every past
 * write having refreshed it. MANUAL is a manager's audited override and is reported as entered.
 */
export function planItemProgress(
  row: Pick<PlanMilestoneRow, 'status' | 'progressMode' | 'progressPercent'>,
  group: PlanTaskGroup,
  deliverableTotal: number,
  deliverableDone: number,
): number {
  if (row.progressMode === MILESTONE_PROGRESS_MODE.MANUAL) {
    return row.progressPercent;
  }
  if (row.status === MILESTONE_STATUS.COMPLETED) {
    return 100;
  }
  return computeProgress({
    taskTotal: group.total,
    taskDone: group.completed,
    deliverableTotal,
    deliverableDone,
  });
}

function toMilestoneItem(
  row: PlanMilestoneRow,
  group: PlanTaskGroup,
  today: Date,
): ProjectPlanItem {
  const deliverableTotal = row.deliverables.length;
  const deliverableDone = row.deliverables.filter((item) => item.isDone).length;
  const ownDates = row.startDate !== null || row.dueDate !== null;
  return {
    id: row.id,
    kind: PROJECT_PLAN_ITEM_KIND.MILESTONE,
    name: row.name,
    status: row.status as MilestoneStatus,
    startDate: ownDates ? dateOnly(row.startDate) : dateOnly(group.earliest),
    endDate: ownDates ? dateOnly(row.dueDate) : dateOnly(group.latest),
    datesFromTasks: !ownDates && (group.earliest !== null || group.latest !== null),
    progressPercent: planItemProgress(row, group, deliverableTotal, deliverableDone),
    progressMode: row.progressMode as MilestoneProgressMode,
    isOverdue: isMilestoneOverdue(row, today),
    clientVisible: row.clientVisible,
    owner: row.owner,
    dependsOnIds: row.dependsOn.map((edge) => edge.dependsOnId),
    tasks: {
      total: group.total,
      completed: group.completed,
      open: group.total - group.completed,
      overdue: group.overdue,
    },
    deliverables: { total: deliverableTotal, completed: deliverableDone },
  };
}

function toUngroupedItem(group: PlanTaskGroup): ProjectPlanItem {
  return {
    id: UNGROUPED_ITEM_ID,
    kind: PROJECT_PLAN_ITEM_KIND.UNGROUPED,
    name: 'Unscheduled work',
    status: null,
    startDate: dateOnly(group.earliest),
    endDate: dateOnly(group.latest),
    datesFromTasks: group.earliest !== null || group.latest !== null,
    progressPercent: computeProgress({
      taskTotal: group.total,
      taskDone: group.completed,
      deliverableTotal: 0,
      deliverableDone: 0,
    }),
    progressMode: null,
    isOverdue: group.overdue > 0,
    clientVisible: false,
    owner: null,
    dependsOnIds: [],
    tasks: {
      total: group.total,
      completed: group.completed,
      open: group.total - group.completed,
      overdue: group.overdue,
    },
    deliverables: { total: 0, completed: 0 },
  };
}

/**
 * The project's headline percentage — the same rule, and the same function, the project list and
 * the client portal already use, so the plan cannot disagree with the row it was opened from.
 * The milestone and deliverable counters travel beside it as an explanation, not as an input.
 */
export function toPlanProgress(
  taskCounts: TaskCounts,
  cancelledTasks: number,
  items: ProjectPlanItem[],
): ProjectPlanProgress {
  const milestones = items.filter((item) => item.kind === PROJECT_PLAN_ITEM_KIND.MILESTONE);
  return {
    percent: progressPercent(taskCounts, cancelledTasks),
    basis:
      taskCounts.total - cancelledTasks > 0
        ? PROJECT_PROGRESS_BASIS.TASKS
        : PROJECT_PROGRESS_BASIS.NONE,
    taskTotal: taskCounts.total - cancelledTasks,
    taskCompleted: taskCounts.completed,
    milestoneTotal: milestones.length,
    milestoneCompleted: milestones.filter((item) => item.status === MILESTONE_STATUS.COMPLETED)
      .length,
    deliverableTotal: milestones.reduce((sum, item) => sum + item.deliverables.total, 0),
    deliverableCompleted: milestones.reduce((sum, item) => sum + item.deliverables.completed, 0),
  };
}

export function toPlanWindow(
  project: { startDate: Date | null; targetDate: Date | null },
  items: ProjectPlanItem[],
  today: Date,
): ProjectPlanWindow {
  return {
    startDate: min([dateOnly(project.startDate), ...items.map((item) => item.startDate)]),
    endDate: max([dateOnly(project.targetDate), ...items.map((item) => item.endDate)]),
    todayDate: today.toISOString().slice(0, 10),
  };
}

export function toProjectPlan(input: {
  project: ProjectRef & { startDate: Date | null; targetDate: Date | null };
  milestones: PlanMilestoneRow[];
  groups: PlanTaskGroup[];
  taskCounts: TaskCounts;
  cancelledTasks: number;
  today: Date;
}): ProjectPlan {
  const byMilestone = new Map(input.groups.map((group) => [group.milestoneId, group]));
  const items = input.milestones.map((row) =>
    toMilestoneItem(row, byMilestone.get(row.id) ?? EMPTY_GROUP, input.today),
  );
  const ungrouped = byMilestone.get(null);
  if (ungrouped && ungrouped.total > 0) {
    items.push(toUngroupedItem(ungrouped));
  }
  return {
    project: { id: input.project.id, code: input.project.code, name: input.project.name },
    window: toPlanWindow(input.project, items, input.today),
    progress: toPlanProgress(input.taskCounts, input.cancelledTasks, items),
    items,
  };
}
