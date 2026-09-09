import { OPERATIONS_TODAY_STATUSES, type OperationsScope } from '@ashniva/types';

/**
 * Where each dashboard KPI card goes.
 *
 * Kept in one place because a card is a promise: the number on it and the list it opens have to
 * be the same set of rows. Each link below reproduces the filter the API counted for that KPI —
 * see `dashboard-builders.ts` — so changing one without the other is a visible bug.
 */
export const CARD_LINKS = {
  // Management (Super Admin, Project Manager) — counted across the whole organization.
  activeProjects: '/projects',
  projectsAtRisk: '/projects',
  completedToday: '/tasks?view=all&completedToday=true',
  /** q.overdue() with no assignee: every open, past-due task in the organization. */
  overdueTasks: '/tasks?view=all&overdue=true',
  criticalTickets: '/tickets?view=critical',
  pendingReviews: '/tasks?view=all&status=IN_REVIEW',
  updatesWaitingToPublish: '/completed-today',
  openTickets: '/tickets?view=open',
  slaAtRisk: '/tickets?view=sla-at-risk',
  slaBreached: '/tickets?view=sla-breached',
  contractsExpiring: '/contracts?view=expiring',
  approvalsWaitingClient: '/approvals?view=waiting-client',
  openChangeRequests: '/change-requests?view=open',

  // Team Lead — the management half counts the lead's teams, the own half counts the lead.
  assignedByMe: '/tasks?view=by-me',
  teamDelayed: '/tasks?view=team&overdue=true',
  /** The team's work sitting in review, not the lead's personal review queue. */
  teamUnderReview: '/tasks?view=team&status=IN_REVIEW',
  teamCompletedToday: '/tasks?view=team&completedToday=true',
  /** Tasks waiting for the signed-in person to review or test. */
  myReviewQueue: '/tasks?view=review',

  // Support desk.
  newTickets: '/tickets?view=new',
  ticketsAssignedToMe: '/tickets?view=mine',
  ticketsInProgress: '/tickets?view=open&status=IN_PROGRESS',
  waitingForClient: '/tickets?view=waiting',
  resolvedToday: '/tickets?view=resolved&resolvedToday=true',

  // Developer / Team Lead's own work.
  myToday: '/tasks?view=today',
  myInProgress: '/tasks?view=my&status=IN_PROGRESS',
  myOverdue: '/tasks?view=overdue',
  myCompletedToday: '/tasks?view=done&completedToday=true',
  myReports: '/reports',
} as const;

/**
 * The operational dashboard's task KPIs, as the query the API counted them with.
 *
 * They are fragments rather than whole URLs because the scope is decided by the caller's role and
 * the API says which view reproduces it: `team` for a team lead, `all` for a manager. The status
 * lists come from `@ashniva/types` — the same constant the builder folds its `groupBy` with — so a
 * status added to the pipeline reaches the card and the list it opens in one edit.
 */
export const OPERATIONS_TASK_FILTERS = {
  scheduled: 'scheduledToday=true',
  started: 'startedToday=true',
  completed: 'completedToday=true',
  overdue: 'overdue=true',
  upcoming: 'upcoming=true',
  blocked: `status=${OPERATIONS_TODAY_STATUSES.blocked.join(',')}`,
  returnedToDeveloper: `status=${OPERATIONS_TODAY_STATUSES.returnedToDeveloper.join(',')}`,
  waitingForReview: `status=${OPERATIONS_TODAY_STATUSES.waitingForReview.join(',')}`,
  waitingForQa: `status=${OPERATIONS_TODAY_STATUSES.waitingForQa.join(',')}`,
} as const;

export type OperationsTaskCard = keyof typeof OPERATIONS_TASK_FILTERS;

export function operationsTaskLink(scope: OperationsScope, card: OperationsTaskCard): string {
  return `/tasks?view=${scope.taskListView}&${OPERATIONS_TASK_FILTERS[card]}`;
}

/** The same for the support KPIs. `unacknowledged` is missing on purpose — see below. */
export const OPERATIONS_TICKET_FILTERS = {
  newTickets: 'view=new',
  assigned: 'view=all&status=ASSIGNED,AUTO_ASSIGNED',
  escalated: 'view=all&status=ESCALATED',
  slaAtRisk: 'view=sla-at-risk',
  slaBreached: 'view=sla-breached',
} as const;

export type OperationsTicketCard = keyof typeof OPERATIONS_TICKET_FILTERS;

/**
 * Where a support KPI opens, or `null` when the ticket list cannot reproduce the scope it counted.
 *
 * The ticket list narrows to one project at a time, so a team lead covering three of them has no
 * URL that means the same set. Rather than link to a wider list and quietly show more rows than
 * the card counted, the card stays unclickable and says why.
 */
export function operationsTicketLink(
  scope: OperationsScope,
  card: OperationsTicketCard,
): string | null {
  const filter = OPERATIONS_TICKET_FILTERS[card];
  if (scope.kind === 'organization') {
    return `/tickets?${filter}`;
  }
  const [projectId] = scope.projectIds;
  return scope.projectIds.length === 1 && projectId
    ? `/tickets?${filter}&projectId=${projectId}`
    : null;
}
