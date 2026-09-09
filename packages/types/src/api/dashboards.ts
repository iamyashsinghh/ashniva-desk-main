import type { AvailabilityStatus } from '../domain/availability';
import type { ProjectHealth, ProjectStatus } from '../domain/project-status';
import type { ReleaseStatus } from '../workflow/release-status';
import { TASK_STATUS, type TaskStatus } from '../workflow/task-status';
import type { UnavailableReason } from '../workflow/availability-resolution';
import type { OrganizationRef, UserRef } from './identity';
import type { TicketSummary } from './tickets';
import type {
  ClientUpdateSummary,
  ProjectMemberSummary,
  ProjectRef,
  ProjectSummary,
  TaskRef,
  TaskSummary,
} from './work';

export interface WorkloadEntry {
  user: UserRef;
  title: string | null;
  openTasks: number;
  inProgress: number;
  inReview: number;
  overdue: number;
  blocked: number;
  minutesToday: number;
}

export interface StatusCount {
  status: TaskStatus;
  count: number;
}

/** Super Admin and Project Manager. */
export interface ManagementDashboard {
  kind: 'management';
  kpis: {
    activeProjects: number;
    projectsAtRisk: number;
    completedToday: number;
    overdueTasks: number;
    criticalTickets: number;
    pendingReviews: number;
    updatesWaitingToPublish: number;
    openTickets: number;
    /** Open tickets whose SLA is at risk or breached (backend-computed). */
    slaAtRisk: number;
    slaBreached: number;
    /** Active contracts ending within the warning window. */
    contractsExpiring: number;
    /** Approval requests published and waiting for a client decision. */
    approvalsWaitingClient: number;
    /** Change requests not yet completed, rejected or cancelled. */
    openChangeRequests: number;
  };
  projects: ProjectSummary[];
  workload: WorkloadEntry[];
  overdueTasks: TaskSummary[];
  criticalTickets: TicketSummary[];
  updatesWaiting: ClientUpdateSummary[];
}

/** Team Lead / Senior: what they manage, and separately their own development work. */
export interface SeniorDashboard {
  kind: 'senior';
  management: {
    assignedByMe: number;
    teamProgress: StatusCount[];
    completedToday: number;
    underReview: number;
    delayed: number;
    blockers: TaskSummary[];
    reviewQueue: TaskSummary[];
    updatesWaitingToPublish: number;
    workload: WorkloadEntry[];
  };
  own: {
    enabled: boolean;
    todayTasks: TaskSummary[];
    inProgress: number;
    overdue: number;
    minutesToday: number;
  };
}

export interface DeveloperDashboard {
  kind: 'developer';
  kpis: {
    today: number;
    inProgress: number;
    overdue: number;
    blocked: number;
    completedToday: number;
    minutesToday: number;
  };
  todayTasks: TaskSummary[];
  inProgressTasks: TaskSummary[];
  overdueTasks: TaskSummary[];
  blockedTasks: TaskSummary[];
  reviewResults: TaskSummary[];
}

export interface TesterDashboard {
  kind: 'tester';
  kpis: {
    awaitingTesting: number;
    approvedToday: number;
    rejectedToday: number;
    reopened: number;
  };
  awaitingTesting: TaskSummary[];
  reopened: TaskSummary[];
  history: TaskSummary[];
}

export interface SupportDashboard {
  kind: 'support';
  kpis: {
    newTickets: number;
    assignedToMe: number;
    inProgress: number;
    waitingForClient: number;
    critical: number;
    resolvedToday: number;
    slaAtRisk: number;
    slaBreached: number;
  };
  newTickets: TicketSummary[];
  myTickets: TicketSummary[];
  waitingForClient: TicketSummary[];
  criticalTickets: TicketSummary[];
  /** Open tickets at risk of or past an SLA target, soonest deadline first. */
  slaTickets: TicketSummary[];
}

/** Internal employees of group companies: their own tickets only. */
export interface EmployeeDashboard {
  kind: 'employee';
  kpis: { open: number; waitingForYou: number; resolved: number };
  tickets: TicketSummary[];
}

// ---------------------------------------------------------------------------------------------
// Operational dashboard (package 7b) — Manager and Team Lead
// ---------------------------------------------------------------------------------------------

/**
 * How wide the operational dashboard's numbers reach.
 *
 * Named rather than implied because every card on the screen is a promise that the number and the
 * list it opens are the same rows, and the list can only reproduce a scope it has a view for.
 * `taskListView` is that view: `team` selects the lead's teams, `all` the whole organization.
 */
export const OPERATIONS_SCOPE = {
  /** Super Admin and Project Manager: every active project in the organization. */
  ORGANIZATION: 'organization',
  /** Team Lead: the projects they manage, lead or belong to, and the people in their teams. */
  TEAM: 'team',
} as const;

export type OperationsScopeKind = (typeof OPERATIONS_SCOPE)[keyof typeof OPERATIONS_SCOPE];

export interface OperationsScope {
  kind: OperationsScopeKind;
  /** The projects every project-shaped number covers. Empty means the caller is on none yet. */
  projectIds: string[];
  /** The task-list view that selects exactly the people Today and Team count. */
  taskListView: 'all' | 'team';
}

/** One project as an operations reader needs it: state, people, and what is stuck. */
export interface OperationsProjectRow {
  project: ProjectRef;
  clientOrganization: OrganizationRef | null;
  status: ProjectStatus;
  health: ProjectHealth;
  progressPercent: number;
  manager: UserRef | null;
  lead: UserRef | null;
  /** Who is on the project now and what each of them is responsible for here. */
  team: ProjectMemberSummary[];
  blocked: number;
  overdue: number;
  pendingQa: number;
  pendingUat: number;
  pendingRelease: number;
  openTickets: number;
  escalatedTickets: number;
}

/**
 * The statuses behind each state-shaped Today card.
 *
 * Shared rather than written out on both sides, because the API counts these and the web app
 * links to a task list filtered by them; two copies would let a card open a different set from
 * the one it counted the first time a status was added to the pipeline.
 */
export const OPERATIONS_TODAY_STATUSES = {
  blocked: [TASK_STATUS.BLOCKED],
  returnedToDeveloper: [TASK_STATUS.RETURNED_TO_DEV],
  waitingForReview: [TASK_STATUS.IN_REVIEW, TASK_STATUS.CODE_REVIEW],
  waitingForQa: [TASK_STATUS.READY_FOR_QA, TASK_STATUS.TESTING_STAGING],
} as const satisfies Record<string, readonly TaskStatus[]>;

export type OperationsTodayStateKey = keyof typeof OPERATIONS_TODAY_STATUSES;

/** The statuses each "waiting for somebody else" column of the project grid counts. */
export const OPERATIONS_PROJECT_STATUSES = {
  pendingQa: [TASK_STATUS.READY_FOR_QA, TASK_STATUS.TESTING_STAGING],
  pendingUat: [TASK_STATUS.CLIENT_UAT],
  pendingRelease: [TASK_STATUS.QA_PASSED, TASK_STATUS.READY_TO_PUBLISH],
} as const satisfies Record<string, readonly TaskStatus[]>;

/** Everything the scope's people are doing today, in the states a lead acts on. */
export interface OperationsToday {
  scheduled: number;
  started: number;
  completed: number;
  overdue: number;
  upcoming: number;
  blocked: number;
  returnedToDeveloper: number;
  waitingForReview: number;
  waitingForQa: number;
}

/**
 * One person's current load.
 *
 * Counts of work in a state, never a score: there is no rate, no ranking and no total carried
 * from one day to the next, for the reason `task-timing.ts` sets out at length.
 */
export interface OperationsTeamMember {
  user: UserRef;
  title: string | null;
  openTasks: number;
  inProgress: number;
  dueToday: number;
  delayed: number;
  minutesToday: number;
  /** What they have open right now, when exactly one task is in progress. */
  currentTask: TaskRef | null;
}

/** A person's effective availability verdict, from `resolveAvailability`. */
export interface OperationsAvailabilityEntry {
  user: UserRef;
  status: AvailabilityStatus;
  available: boolean;
  reason: UnavailableReason | null;
  withinSchedule: boolean;
  /** True when the answer came from the rota because nothing more current was known. */
  fromSchedule: boolean;
  onCall: boolean;
  schedule: {
    workingDays: number[];
    startMinute: number;
    endMinute: number;
    timezone: string;
  } | null;
}

/**
 * Estimated against actual, and whether the work is going to land on time.
 *
 * The four open buckets are `computeTaskTiming`'s own verdicts for work that has not finished;
 * the three completed ones are its verdicts for work that has. Nothing here is aggregated per
 * person.
 */
export interface OperationsTime {
  inHand: number;
  atRisk: number;
  delayed: number;
  unscheduled: number;
  completedOnTime: number;
  completedLate: number;
  completedUnscheduled: number;
  /** Planned effort on the open work in scope. */
  estimateMinutes: number;
  /** Effort actually logged against it. */
  loggedMinutes: number;
  /** Open work nearest its expected time, each row carrying its own timing verdict. */
  tasks: TaskSummary[];
}

/** A ticket that needs somebody, with the routing state that explains why. */
export interface OperationsSupportTicket {
  ticket: TicketSummary;
  /** Who holds it now; null while it is still in the queue. */
  owner: UserRef | null;
  acknowledgeDueAt: string | null;
  acknowledgedAt: string | null;
  escalationLevel: number;
  /** Why the router queued it instead of assigning it. */
  queueReason: string | null;
}

/** Per-project routing configuration. Only for callers who may manage support routing. */
export interface OperationsSupportRouting {
  project: ProjectRef;
  autoRouteEnabled: boolean;
  fallbackUser: UserRef | null;
  ackMinutes: number;
  escalationMinutes: number;
}

export interface OperationsSupport {
  newTickets: number;
  assigned: number;
  unacknowledged: number;
  escalated: number;
  slaAtRisk: number;
  slaBreached: number;
  attention: OperationsSupportTicket[];
  /** Absent — not empty — when the caller may not manage support routing. */
  routing?: OperationsSupportRouting[];
}

export interface OperationsReleaseRow {
  id: string;
  version: string;
  title: string;
  status: ReleaseStatus;
  project: ProjectRef;
  scheduledFor: string | null;
}

export interface OperationsRelease {
  qaWaiting: number;
  qaFailed: number;
  qaPassed: number;
  uatPending: number;
  /** Releases that failed or were rolled back and are holding the next one up. */
  blockers: number;
  readyToRelease: number;
  releases: OperationsReleaseRow[];
}

/**
 * Contract money for the projects in scope, one row per currency.
 *
 * Per currency rather than one total, because adding rupees to dollars produces a number that is
 * wrong in both. Only for callers who may read costs — `internalCost` never leaves the provider.
 */
export interface OperationsCost {
  currency: string;
  contracts: number;
  contractValue: string;
  internalCost: string;
}

/**
 * Package 7b: what is happening across a manager's or team lead's permitted projects, computed
 * server-side so the web app can only hide a section, never widen one.
 *
 * The optional members are omitted rather than null-filled when the caller lacks the permission
 * that guards the same data elsewhere: a section that is absent cannot be read off the wire.
 */
export interface OperationsDashboard {
  kind: 'operations';
  scope: OperationsScope;
  projects: OperationsProjectRow[];
  today: OperationsToday;
  time: OperationsTime;
  support: OperationsSupport;
  release: OperationsRelease;
  /** Absent without `report:read-team`. */
  team?: OperationsTeamMember[];
  /** Absent without `support-routing:manage`. */
  availability?: OperationsAvailabilityEntry[];
  /** Absent without `cost:read`. */
  cost?: OperationsCost[];
}

export type DashboardResponse =
  | ManagementDashboard
  | SeniorDashboard
  | DeveloperDashboard
  | TesterDashboard
  | SupportDashboard
  | EmployeeDashboard
  | OperationsDashboard;
