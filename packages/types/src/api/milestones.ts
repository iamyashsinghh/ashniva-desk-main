import type { MilestoneProgressMode, MilestoneStatus } from '../workflow/milestone-status';
import type { UserRef } from './identity';
import type { ProjectRef } from './work';

export interface MilestoneRef {
  id: string;
  name: string;
}

export interface DeliverableSummary {
  id: string;
  title: string;
  description: string | null;
  isDone: boolean;
  doneAt: string | null;
  sortOrder: number;
}

export interface MilestoneHistoryEntry {
  id: string;
  kind: 'CREATED' | 'STATUS' | 'PROGRESS' | 'DELIVERABLE' | 'UPDATED' | 'APPROVAL';
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  changedBy: UserRef;
  createdAt: string;
}

export interface MilestoneSummary extends MilestoneRef {
  description: string | null;
  project: ProjectRef;
  contract: { id: string; number: string; title: string } | null;
  owner: UserRef | null;
  startDate: string | null;
  dueDate: string | null;
  status: MilestoneStatus;
  progressPercent: number;
  progressMode: MilestoneProgressMode;
  clientVisible: boolean;
  requiresApproval: boolean;
  /** Status of the latest approval request when one exists. */
  approvalStatus: string | null;
  isOverdue: boolean;
  deliverableCount: number;
  deliverablesDone: number;
  linkedTaskCount: number;
  linkedTasksCompleted: number;
  completedAt: string | null;
  sortOrder: number;
}

export interface MilestoneDetail extends MilestoneSummary {
  deliverables: DeliverableSummary[];
  dependsOn: MilestoneRef[];
  dependents: MilestoneRef[];
  linkedTasks: Array<{ id: string; key: string; title: string; status: string }>;
  history: MilestoneHistoryEntry[];
  changeRequest: { id: string; number: string; title: string } | null;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

/** Client-portal milestone: no owner, no internal history. */
export interface PortalMilestoneSummary extends MilestoneRef {
  description: string | null;
  project: ProjectRef;
  startDate: string | null;
  dueDate: string | null;
  status: MilestoneStatus;
  progressPercent: number;
  requiresApproval: boolean;
  approvalStatus: string | null;
  deliverables: Array<{ id: string; title: string; isDone: boolean }>;
  completedAt: string | null;
}
