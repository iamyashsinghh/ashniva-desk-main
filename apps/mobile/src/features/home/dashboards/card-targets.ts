import { OPERATIONS_TODAY_STATUSES, type OperationsScope } from '@ashniva/types';

/**
 * Where each dashboard tile goes.
 *
 * A tile is a promise: the number on it and the list it opens have to be the same rows. The links
 * below are the web app's `CARD_LINKS`, value for value, because each one reproduces the filter the
 * API counted that KPI with (`dashboard-builders.ts`). They are copied rather than imported — the
 * mobile app cannot reach into `apps/web` — so a change to one side has to be made on both.
 *
 * The phone has a task list and a ticket list that take the same query as the web's, plus the
 * projects and approvals screens. Anything else the web links to (contracts, change requests,
 * reports, Completed Today) has no screen here, and that tile is shown but not pressable: opening a
 * different list from the one counted would be worse than opening none.
 */
export const CARD_LINKS = {
  activeProjects: '/projects',
  projectsAtRisk: '/projects',
  completedToday: '/tasks?view=all&completedToday=true',
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

  assignedByMe: '/tasks?view=by-me',
  teamDelayed: '/tasks?view=team&overdue=true',
  teamUnderReview: '/tasks?view=team&status=IN_REVIEW',
  teamCompletedToday: '/tasks?view=team&completedToday=true',
  myReviewQueue: '/tasks?view=review',

  newTickets: '/tickets?view=new',
  ticketsAssignedToMe: '/tickets?view=mine',
  ticketsInProgress: '/tickets?view=open&status=IN_PROGRESS',
  waitingForClient: '/tickets?view=waiting',
  resolvedToday: '/tickets?view=resolved&resolvedToday=true',

  myToday: '/tasks?view=today',
  myInProgress: '/tasks?view=my&status=IN_PROGRESS',
  myOverdue: '/tasks?view=overdue',
  myCompletedToday: '/tasks?view=done&completedToday=true',
  myReports: '/reports',

  /** The employee dashboard's own-tickets tile; the web writes it inline. */
  myTickets: '/tickets',
} as const;

export type CardLinkKey = keyof typeof CARD_LINKS;

export type CardTarget =
  | { kind: 'tasks'; title: string; query: Record<string, string> }
  | { kind: 'tickets'; title: string; query: Record<string, string> }
  | { kind: 'projects' }
  | { kind: 'approvals' };

/** `a=1&b=x%2Cy` → `{ a: '1', b: 'x,y' }`. Hand-rolled: React Native's `URLSearchParams` is partial. */
export function parseQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const pair of search.split('&')) {
    if (!pair) {
      continue;
    }
    const [rawKey = '', ...rest] = pair.split('=');
    const key = decodeURIComponent(rawKey);
    if (key) {
      query[key] = decodeURIComponent(rest.join('='));
    }
  }
  return query;
}

/** A web dashboard link as a phone destination, or `null` when the phone has no such list. */
export function linkTarget(link: string, title: string): CardTarget | null {
  const [path = '', search = ''] = link.split('?', 2);
  switch (path) {
    case '/tasks':
      return { kind: 'tasks', title, query: parseQuery(search) };
    case '/tickets':
      return { kind: 'tickets', title, query: parseQuery(search) };
    case '/projects':
      return { kind: 'projects' };
    case '/approvals':
      return { kind: 'approvals' };
    default:
      return null;
  }
}

export function cardTarget(card: CardLinkKey, title: string): CardTarget | null {
  return linkTarget(CARD_LINKS[card], title);
}

/**
 * The operations board's task KPIs, as the query the API counted them with. Fragments rather than
 * whole links because the view depends on the caller's scope — `team` for a lead, `all` for a
 * manager — and the API names it.
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

export function operationsTaskTarget(
  scope: OperationsScope,
  card: OperationsTaskCard,
  title: string,
): CardTarget | null {
  return linkTarget(`/tasks?view=${scope.taskListView}&${OPERATIONS_TASK_FILTERS[card]}`, title);
}

/** The support KPIs. `unacknowledged` is missing on purpose: no list selects it. */
export const OPERATIONS_TICKET_FILTERS = {
  newTickets: 'view=new',
  assigned: 'view=all&status=ASSIGNED,AUTO_ASSIGNED',
  escalated: 'view=all&status=ESCALATED',
  slaAtRisk: 'view=sla-at-risk',
  slaBreached: 'view=sla-breached',
} as const;

export type OperationsTicketCard = keyof typeof OPERATIONS_TICKET_FILTERS;

/**
 * Where a support KPI opens, or `null` when the ticket list cannot reproduce what it counted.
 *
 * The ticket list narrows to one project at a time, so a lead covering three projects has no query
 * that means the same set. Rather than open a wider list that shows more rows than the tile said,
 * the tile stays unpressable.
 */
export function operationsTicketTarget(
  scope: OperationsScope,
  card: OperationsTicketCard,
  title: string,
): CardTarget | null {
  const filter = OPERATIONS_TICKET_FILTERS[card];
  if (scope.kind === 'organization') {
    return linkTarget(`/tickets?${filter}`, title);
  }
  const [projectId] = scope.projectIds;
  return scope.projectIds.length === 1 && projectId
    ? linkTarget(`/tickets?${filter}&projectId=${projectId}`, title)
    : null;
}
