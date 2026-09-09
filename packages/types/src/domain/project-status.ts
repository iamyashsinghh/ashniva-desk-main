export const PROJECT_STATUS = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

/** Health shown on dashboards; computed from overdue tasks, blockers and critical tickets. */
export const PROJECT_HEALTH = {
  ON_TRACK: 'ON_TRACK',
  AT_RISK: 'AT_RISK',
  DELAYED: 'DELAYED',
} as const;

export type ProjectHealth = (typeof PROJECT_HEALTH)[keyof typeof PROJECT_HEALTH];

export const PROJECT_HEALTH_LABELS: Record<ProjectHealth, string> = {
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  DELAYED: 'Delayed',
};
