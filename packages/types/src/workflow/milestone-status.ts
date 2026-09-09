export const MILESTONE_STATUS = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type MilestoneStatus = (typeof MILESTONE_STATUS)[keyof typeof MILESTONE_STATUS];

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const MILESTONE_TRANSITIONS: Record<MilestoneStatus, readonly MilestoneStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['IN_PROGRESS'],
  CANCELLED: ['PLANNED'],
};

export function canTransitionMilestone(from: MilestoneStatus, to: MilestoneStatus): boolean {
  return MILESTONE_TRANSITIONS[from].includes(to);
}

/** How the progress percentage of a milestone is maintained. */
export const MILESTONE_PROGRESS_MODE = {
  /** Computed from linked tasks (completed / total, deliverables when there are no tasks). */
  AUTO: 'AUTO',
  /** Set by an authorized manager with an audited reason. */
  MANUAL: 'MANUAL',
} as const;

export type MilestoneProgressMode =
  (typeof MILESTONE_PROGRESS_MODE)[keyof typeof MILESTONE_PROGRESS_MODE];
