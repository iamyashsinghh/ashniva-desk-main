import {
  MILESTONE_STATUS,
  PROJECT_PLAN_ITEM_KIND,
  type MilestoneStatus,
  type PortalProjectPlanItem,
  type ProjectPlanItem,
} from '@ashniva/types';

import type { TimelineBar, TimelineTone } from './ProjectTimeline';

/** The bar's colour follows the milestone's own state, not its percentage. */
export function toneFor(status: MilestoneStatus | null, isOverdue: boolean): TimelineTone {
  if (isOverdue) {
    return 'late';
  }
  if (status === MILESTONE_STATUS.COMPLETED) {
    return 'done';
  }
  if (status === MILESTONE_STATUS.IN_PROGRESS || status === null) {
    return 'active';
  }
  return 'planned';
}

function countsMeta(done: number, total: number, noun: string): string | null {
  return total > 0 ? `${done}/${total} ${noun}` : null;
}

export function toInternalBar(item: ProjectPlanItem): TimelineBar {
  const meta = [
    countsMeta(item.tasks.completed, item.tasks.total, 'tasks'),
    countsMeta(item.deliverables.completed, item.deliverables.total, 'deliverables'),
    item.tasks.overdue > 0 ? `${item.tasks.overdue} overdue` : null,
    item.owner?.name ?? null,
    item.datesFromTasks ? 'dates from the work' : null,
    item.kind === PROJECT_PLAN_ITEM_KIND.UNGROUPED ? 'not on a milestone' : null,
  ].filter((value): value is string => value !== null);
  return {
    id: item.id,
    name: item.name,
    startDate: item.startDate,
    endDate: item.endDate,
    progressPercent: item.progressPercent,
    tone: toneFor(item.status, item.isOverdue),
    meta: meta.join(' · ') || undefined,
  };
}

export function toPortalBar(item: PortalProjectPlanItem): TimelineBar {
  const meta = [
    countsMeta(item.deliverables.completed, item.deliverables.total, 'deliverables'),
    countsMeta(item.tasks.completed, item.tasks.total, 'work items'),
  ].filter((value): value is string => value !== null);
  return {
    id: item.id,
    name: item.name,
    startDate: item.startDate,
    endDate: item.endDate,
    progressPercent: item.progressPercent,
    // A client is not shown who is late; the bar says planned, in progress or done.
    tone: toneFor(item.status, false),
    meta: meta.join(' · ') || undefined,
  };
}
