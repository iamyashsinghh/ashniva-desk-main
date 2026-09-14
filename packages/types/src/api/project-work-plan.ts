import type { WorkPlanSource } from '../workflow/work-plan';
import type { UserRef } from './identity';
import type { FileSummary } from './work';

/**
 * The project's own phase plan: headings, titles and timed points, built from a PDF or by hand.
 *
 * Points stay hidden until somebody presses Start. That click is also the start of the timer.
 * Missing the timer lowers this person's on-time percentage *on this plan*, not a global score.
 */

export interface WorkPlanPoint {
  id: string;
  body: string | null;
  estimateMinutes: number;
  sortOrder: number;
  startedAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  remainingSeconds: number;
  overdue: boolean;
  startedBy: UserRef | null;
  canStart: boolean;
  canComplete: boolean;
}

export interface WorkPlanTitle {
  id: string;
  title: string;
  sortOrder: number;
  points: WorkPlanPoint[];
}

export interface WorkPlanPhase {
  id: string;
  heading: string;
  sortOrder: number;
  titles: WorkPlanTitle[];
}

export interface WorkPlanScore {
  user: UserRef;
  percent: number;
}

export interface ProjectWorkPlan {
  projectId: string;
  source: WorkPlanSource | null;
  sourceFile: Pick<FileSummary, 'id' | 'name' | 'contentType' | 'sizeBytes'> | null;
  phases: WorkPlanPhase[];
  scores: WorkPlanScore[];
  canManage: boolean;
  canWork: boolean;
}

export interface WorkPlanPointInput {
  id?: string;
  body: string;
  estimateMinutes: number;
}

export interface WorkPlanTitleInput {
  id?: string;
  title: string;
  points: WorkPlanPointInput[];
}

export interface WorkPlanPhaseInput {
  id?: string;
  heading: string;
  titles: WorkPlanTitleInput[];
}

export interface SaveWorkPlanInput {
  phases: WorkPlanPhaseInput[];
}

export interface ParseWorkPlanInput {
  fileId: string;
}
