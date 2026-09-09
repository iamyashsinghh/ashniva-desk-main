/** Advanced reports (Phase 2). Each has a backend query, filters and a CSV export. */
export const REPORT_TYPE = {
  PROJECT_PROGRESS: 'project-progress',
  MILESTONE_PROGRESS: 'milestone-progress',
  CONTRACT_STATUS: 'contract-status',
  SUPPORT_HOURS: 'support-hours',
  SLA_PERFORMANCE: 'sla-performance',
  TICKET_VOLUME: 'ticket-volume',
  TASK_COMPLETION: 'task-completion',
  TEAM_WORKLOAD: 'team-workload',
  CLIENT_COMPLETED_WORK: 'client-completed-work',
  CHANGE_REQUESTS: 'change-requests',
} as const;

export type ReportType = (typeof REPORT_TYPE)[keyof typeof REPORT_TYPE];

export const ALL_REPORT_TYPES: readonly ReportType[] = Object.values(REPORT_TYPE);

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  'project-progress': 'Project progress',
  'milestone-progress': 'Milestone progress',
  'contract-status': 'Contract status and renewals',
  'support-hours': 'Support hours',
  'sla-performance': 'SLA performance and breaches',
  'ticket-volume': 'Ticket volume and resolution',
  'task-completion': 'Task completion and delays',
  'team-workload': 'Team workload',
  'client-completed-work': 'Client-visible completed work',
  'change-requests': 'Change-request status and impact',
};

/** Reports a client organization may run (client-visible data of their own organization only). */
export const CLIENT_REPORT_TYPES: readonly ReportType[] = [
  'project-progress',
  'milestone-progress',
  'contract-status',
  'support-hours',
  'sla-performance',
  'ticket-volume',
  'client-completed-work',
  'change-requests',
];
