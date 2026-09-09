import type { MilestoneProgressMode, MilestoneStatus } from '../workflow/milestone-status';
import type { UserRef } from './identity';
import type { ProjectRef } from './work';

/**
 * The project plan: the milestones of a project and the work grouped under them, placed on a
 * calendar, with every number derived from records that already exist.
 *
 * Nothing here is stored as a plan of its own. The rows behind it are the project, its
 * milestones, their deliverables and the tasks that point at a milestone; the API reads them and
 * computes the rest, so no one has to remember to update a percentage.
 */

/** What the headline percentage was computed from. */
export const PROJECT_PROGRESS_BASIS = {
  /** Completed tasks ÷ tasks that are not cancelled. */
  TASKS: 'TASKS',
  /** The project has no task to count yet. */
  NONE: 'NONE',
} as const;

export type ProjectProgressBasis =
  (typeof PROJECT_PROGRESS_BASIS)[keyof typeof PROJECT_PROGRESS_BASIS];

export const PROJECT_PLAN_ITEM_KIND = {
  MILESTONE: 'MILESTONE',
  /** Work in the project that no milestone claims. Never shown to a client. */
  UNGROUPED: 'UNGROUPED',
} as const;

export type ProjectPlanItemKind =
  (typeof PROJECT_PLAN_ITEM_KIND)[keyof typeof PROJECT_PLAN_ITEM_KIND];

/** The calendar the bars are drawn on: the earliest and latest dates the plan touches. */
export interface ProjectPlanWindow {
  startDate: string | null;
  endDate: string | null;
  /** The server's today, so every client draws the "now" line on the same day. */
  todayDate: string;
}

export interface ProjectPlanTaskCounts {
  /** Tasks that count towards progress — cancelled ones are excluded everywhere. */
  total: number;
  completed: number;
  open: number;
  overdue: number;
}

export interface ProjectPlanDeliverableCounts {
  total: number;
  completed: number;
}

/**
 * The project's single progress number, plus the counts it came from so a screen can explain it
 * rather than assert it. `percent` is the same rule the project list and the client portal use.
 */
export interface ProjectPlanProgress {
  percent: number;
  basis: ProjectProgressBasis;
  taskTotal: number;
  taskCompleted: number;
  milestoneTotal: number;
  milestoneCompleted: number;
  deliverableTotal: number;
  deliverableCompleted: number;
}

/** One bar on the timeline: a milestone, or the bucket of work no milestone claims. */
export interface ProjectPlanItem {
  /** The milestone id; the ungrouped bucket has no row of its own and uses a fixed key. */
  id: string;
  kind: ProjectPlanItemKind;
  name: string;
  /** Milestones carry a status; the ungrouped bucket does not. */
  status: MilestoneStatus | null;
  /** The milestone's own dates when it has them, else the span of the work under it. */
  startDate: string | null;
  endDate: string | null;
  /** Whether the dates came from the milestone itself or from the tasks under it. */
  datesFromTasks: boolean;
  progressPercent: number;
  /** AUTO progress is recomputed on read; MANUAL is an audited override a manager entered. */
  progressMode: MilestoneProgressMode | null;
  isOverdue: boolean;
  clientVisible: boolean;
  owner: UserRef | null;
  /** Milestones that must finish first. */
  dependsOnIds: string[];
  tasks: ProjectPlanTaskCounts;
  deliverables: ProjectPlanDeliverableCounts;
}

export interface ProjectPlan {
  project: ProjectRef;
  window: ProjectPlanWindow;
  progress: ProjectPlanProgress;
  items: ProjectPlanItem[];
}

/**
 * The plan as a client reads it. A narrowing of `ProjectPlan`, written out field by field rather
 * than derived from it, so a field added to the internal shape cannot arrive here by itself:
 * no owner, no visibility flag, no dependency graph, no overdue counts, and no ungrouped bucket
 * — work outside the shared milestones is not the client's to see.
 */
export interface PortalProjectPlanItem {
  id: string;
  name: string;
  status: MilestoneStatus;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  tasks: Pick<ProjectPlanTaskCounts, 'total' | 'completed'>;
  deliverables: ProjectPlanDeliverableCounts;
}

export interface PortalProjectPlanProgress {
  percent: number;
  basis: ProjectProgressBasis;
  taskTotal: number;
  taskCompleted: number;
  milestoneTotal: number;
  milestoneCompleted: number;
}

export interface PortalProjectPlan {
  project: ProjectRef;
  window: ProjectPlanWindow;
  progress: PortalProjectPlanProgress;
  items: PortalProjectPlanItem[];
}
