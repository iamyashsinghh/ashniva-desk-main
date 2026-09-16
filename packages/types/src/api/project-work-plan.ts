import type {
  WorkPlanAssignScope,
  WorkPlanNoteKind,
  WorkPlanPointStatus,
  WorkPlanSource,
} from '../workflow/work-plan';
import type { Priority } from '../domain/priority';
import type { UserRef } from './identity';
import type { FileSummary } from './work';

/**
 * The project's own phase plan: headings, titles and timed points, built from a PDF or by hand.
 *
 * Point text is visible on titles the viewer is allowed to see. Developers only receive work
 * assigned to them (project, phase or topic). Managers, leads and testers see the full plan.
 * Start begins the timer. Missing the timer lowers this person's on-time percentage *on this
 * plan*, not a global score.
 */

export interface WorkPlanNote {
  id: string;
  kind: WorkPlanNoteKind;
  body: string;
  createdAt: string;
  author: UserRef;
  replies: WorkPlanNote[];
}

export interface WorkPlanPoint {
  id: string;
  body: string | null;
  estimateMinutes: number;
  sortOrder: number;
  status: WorkPlanPointStatus;
  startedAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  remainingSeconds: number;
  overdue: boolean;
  startedBy: UserRef | null;
  notes: WorkPlanNote[];
  canStart: boolean;
  /** Developer sending the point to the tester. Timer keeps running. */
  canSubmitTest: boolean;
  /** Tester starting their pass after the developer sent the point. */
  canStartTest: boolean;
  /** Tester or team lead marking the point done. This is what stops the timer. */
  canPass: boolean;
  /** Tester or team lead sending it back with an issue. */
  canFail: boolean;
  canDoubt: boolean;
  canReply: boolean;
}

export interface WorkPlanTitle {
  id: string;
  title: string;
  sortOrder: number;
  assignedTo: UserRef | null;
  effectiveAssignedTo: UserRef | null;
  priority: Priority | null;
  effectivePriority: Priority;
  points: WorkPlanPoint[];
}

export interface WorkPlanPhase {
  id: string;
  heading: string;
  sortOrder: number;
  assignedTo: UserRef | null;
  /** Own value. Null means this phase uses the whole-project priority. */
  priority: Priority | null;
  effectivePriority: Priority;
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
  assignedTo: UserRef | null;
  /** How urgent the whole plan is. Phase and topic can override it. */
  priority: Priority;
  developers: UserRef[];
  phases: WorkPlanPhase[];
  scores: WorkPlanScore[];
  canManage: boolean;
  canWork: boolean;
  canAssign: boolean;
}

export interface AssignWorkPlanInput {
  scope: WorkPlanAssignScope;
  phaseId?: string;
  titleId?: string;
  assignedToId: string | null;
}

export interface WorkPlanAssignmentTarget {
  id: string;
  assignedToId: string | null;
  priority?: Priority | null;
}

/** Full assignment snapshot saved from Summary. Unlisted rows keep their current assignee. */
export interface SaveWorkPlanAssignmentsInput {
  assignedToId: string | null;
  priority: Priority;
  phases: WorkPlanAssignmentTarget[];
  titles: WorkPlanAssignmentTarget[];
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

/** Admin / PM / TL adding work from Summary. AI reads the plan and places related steps. */
export interface AddWorkPlanWorkInput {
  prompt: string;
  assignedToId?: string | null;
  priority?: Priority | null;
}

export interface WorkPlanNoteInput {
  body: string;
  kind?: WorkPlanNoteKind;
}
