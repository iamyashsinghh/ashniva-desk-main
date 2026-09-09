import type { Priority } from '../domain/priority';
import type { ProjectStatus } from '../domain/project-status';
import type { TicketType } from '../domain/ticket-type';
import type { ClientVisibleStatus } from '../workflow/client-visible-status';
import type { PortalApprovalSummary } from './approvals';
import type { PortalContractSummary } from './contracts';
import type { UatRequestSummary } from './qa';
import type { SlaTargetState } from './sla';
import type { OrganizationRef, UserRef } from './identity';
import type { PortalMilestoneSummary } from './milestones';
import type { CommentSummary, FileSummary, ProjectRef, TaskCounts, TaskRef } from './work';

/**
 * Client-portal contracts. Built by allow-list mappers: no internal comments, estimates,
 * costs, failure states, assignee workloads or other clients' data ever appear here.
 */
export interface PortalProjectSummary extends ProjectRef {
  description: string | null;
  status: ProjectStatus;
  progressPercent: number;
  taskCounts: Pick<TaskCounts, 'total' | 'open' | 'inProgress' | 'completed'>;
  openTicketCount: number;
  manager: UserRef | null;
  startDate: string | null;
  targetDate: string | null;
  lastUpdateAt: string | null;
}

export interface PortalTaskSummary {
  id: string;
  key: string;
  title: string;
  status: ClientVisibleStatus;
  priority: Priority;
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string;
}

/**
 * A published update, as the client reads it.
 *
 * Deliberately **not** `ClientUpdateSummary`, which is the internal shape and carries `author` and
 * `publishedBy` as full `UserRef`s — meaning an internal user id and an internal staff email
 * address. Reusing it here handed both to every client that opened the portal.
 *
 * The client's own organization is not repeated either: they know who they are, and a field that
 * names an organization is a field a future query could fill with the wrong one.
 */
export interface PortalClientUpdate {
  id: string;
  title: string;
  body: string;
  /** The day the work was done, as a date. */
  workDate: string;
  project: ProjectRef;
  /** The work this update is about, when it names one. */
  task: TaskRef | null;
  publishedAt: string | null;
}

export interface PortalProjectDetail extends PortalProjectSummary {
  tasks: PortalTaskSummary[];
  milestones: PortalMilestoneSummary[];
  updates: PortalClientUpdate[];
  files: FileSummary[];
}

export interface PortalTicketSummary {
  id: string;
  number: number;
  key: string;
  title: string;
  type: TicketType;
  priority: Priority;
  status: ClientVisibleStatus;
  /** Whether the client needs to do something (waiting for you / confirm resolution). */
  needsYourAction: boolean;
  project: ProjectRef | null;
  requester: UserRef;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** Resolution target only; first-response internals stay internal. */
  sla: { resolution: SlaTargetState; isPaused: boolean } | null;
}

export interface PortalTicketDetail extends PortalTicketSummary {
  description: string;
  impact: string | null;
  resolution: string | null;
  /** Public thread only. */
  replies: CommentSummary[];
  files: FileSummary[];
  canReply: boolean;
  canReopen: boolean;
  canClose: boolean;
}

/**
 * Something holding a piece of work up, said in a way the client can act on.
 *
 * There is no reason field on purpose. `Task.blockedReason` is written for the team — "waiting on
 * the payment gateway sandbox credentials from ops" — and the client's answer to "why" is the
 * published update the team wrote for them, which is what `note` carries when one exists.
 */
export interface PortalProgressBlocker {
  id: string;
  key: string;
  title: string;
  /** True when the hold is on the client's side: a sign-off, an answer, a decision. */
  waitingOnYou: boolean;
  /** When the work last moved, so "stuck since" is answerable. */
  since: string;
  /** The team's own published explanation, when they wrote one. Never an internal reason. */
  note: string | null;
}

/**
 * A release the client was actually told about: a published release note.
 *
 * The `Release` row is the deployment, and it is the provider's — row-level security does not let
 * a client tenant read one at all, and it carries `failureReason` and `rollbackReason`. The note
 * is the client-facing record of the same event, so it is what this list is built from and `id`
 * opens it at `/portal/release-notes/:id`.
 */
export interface PortalProgressRelease {
  id: string;
  version: string;
  releaseDate: string;
  publishedAt: string | null;
  /** The team's published words about the release; null when they published only the item list. */
  summary: string | null;
}

/**
 * "What did the team do on my project today?" — assembled from records that already exist:
 * tasks, client-visible milestones, published updates, releases and UAT requests.
 */
export interface PortalProjectProgress {
  project: ProjectRef;
  /** The provider's calendar day the "completed today" bucket covers. */
  asOfDate: string;
  progressPercent: number;
  taskCounts: Pick<TaskCounts, 'total' | 'open' | 'inProgress' | 'completed'>;
  /** The client-visible milestone the project is working towards; null when none is shared. */
  currentMilestone: PortalMilestoneSummary | null;
  completedToday: PortalTaskSummary[];
  inProgress: PortalTaskSummary[];
  underTesting: PortalTaskSummary[];
  readyToRelease: PortalTaskSummary[];
  upcoming: PortalTaskSummary[];
  blockers: PortalProgressBlocker[];
  recentReleases: PortalProgressRelease[];
  uatRequests: UatRequestSummary[];
  recentUpdates: PortalClientUpdate[];
}

export interface PortalHome {
  organization: OrganizationRef;
  kpis: {
    activeProjects: number;
    overallProgressPercent: number;
    inProgressTasks: number;
    completedToday: number;
    completedThisWeek: number;
    openTickets: number;
    ticketsNeedingYou: number;
    /** Approval requests waiting for a decision from your organization. */
    pendingApprovals: number;
    openChangeRequests: number;
    /** Remaining support minutes across active hour-tracking contracts; null when none. */
    supportHoursRemainingMinutes: number | null;
  };
  projects: PortalProjectSummary[];
  recentUpdates: PortalClientUpdate[];
  openTickets: PortalTicketSummary[];
  recentFiles: FileSummary[];
  contracts: PortalContractSummary[];
  pendingApprovals: PortalApprovalSummary[];
}
