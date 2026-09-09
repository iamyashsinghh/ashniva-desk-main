import type { Priority } from '../domain/priority';
import type {
  EmergencyFixStatus,
  IncidentLinkKind,
  IncidentStatus,
  IncidentTimelineKind,
} from '../domain/incident';
import type { ProblemStatus } from '../workflow/problem-status';
import type { ProblemTicketRelation } from '../workflow/problem-workflow';
import type { RecurringGroupBy, SimilarityDecision } from '../workflow/ticket-similarity';

/**
 * Wire contracts for recurring issues, problems, RCA and incidents (package 11).
 *
 * Every shape here is internal. None of them has a portal counterpart and none of them may be
 * mapped into one: the requirement is explicit that a client never learns another client reported
 * the same fault, and §5 of the product requirements lists RCA discussions among the things a
 * client is never shown. The one deliberate exception is `IncidentDetail.clientSummary`, which a
 * person writes and a person publishes — see the note on that field.
 */

export interface UserRefLite {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ similar tickets */

/**
 * One suggested duplicate.
 *
 * `clientOrganizationName` is present because the person deciding is internal and needs to know
 * whether this is one client reporting twice or two clients reporting the same fault — that
 * distinction is the whole point of the threshold. It never reaches a client response, because
 * nothing maps this type into one.
 */
export interface SimilarTicketSuggestion {
  ticketId: string;
  key: string;
  title: string;
  status: string;
  module: string | null;
  productVersion: string | null;
  clientOrganizationId: string;
  clientOrganizationName: string;
  score: number;
  /** Plain phrases, ready to show: "module Auth", "keywords: slow, mornings". */
  signals: string[];
  decision: SimilarityDecision;
  problemId: string | null;
  createdAt: string;
}

export interface SimilarTicketsResponse {
  /** Ranked, best first, already limited. */
  suggestions: SimilarTicketSuggestion[];
  /** Distinct client organizations across this ticket and its suggestions. */
  clientCount: number;
  /** The project's configured threshold, so the screen can say "3 of 3". */
  duplicateThreshold: number;
  /** True when `clientCount` has reached the threshold and a problem is warranted. */
  thresholdReached: boolean;
  /** The problem these tickets already belong to, when one exists. */
  problemId: string | null;
}

export interface DecideSimilarityInput {
  decision: Extract<SimilarityDecision, 'LINKED' | 'DISMISSED'>;
  /** Required when linking: which problem to link into, or omit to create one. */
  problemId?: string;
  relation?: ProblemTicketRelation;
}

/* ------------------------------------------------------------------ problems */

export interface ProblemSummary {
  id: string;
  /** "PRB-12". */
  key: string;
  number: number;
  title: string;
  status: ProblemStatus;
  severity: Priority;
  product: { id: string; code: string; name: string } | null;
  project: { id: string; code: string; name: string } | null;
  module: string | null;
  versions: string[];
  /** Distinct client organizations among the linked tickets. */
  clientCount: number;
  ticketCount: number;
  owner: UserRefLite | null;
  /** When the duplicate threshold was crossed, if it was. Null for a hand-made problem. */
  thresholdHitAt: string | null;
  hasRca: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A ticket linked to a problem, as an internal reader sees it.
 *
 * The approved design shows the client's name here and says so on the screen: "Each client sees
 * only their own ticket and replies." That sentence is about the *client's* view — the internal
 * one has to name clients or a support executive cannot tell three reports from one.
 */
export interface ProblemTicketLink {
  ticketId: string;
  key: string;
  title: string;
  status: string;
  relation: ProblemTicketRelation;
  clientOrganizationId: string;
  clientOrganizationName: string;
  productVersion: string | null;
  linkedAt: string;
}

/** A question somebody asked the problem's owner, and the answer if one came. */
export interface ProblemQuestion {
  id: string;
  body: string;
  askedBy: UserRefLite | null;
  askedAt: string;
  answer: string | null;
  answeredBy: UserRefLite | null;
  answeredAt: string | null;
}

/** The ten questions of the approved RCA form, in the order the form asks them. */
export interface RcaReport {
  id: string;
  problemId: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED';
  /** 1. What happened? */
  what: string;
  /** 2. Why did it happen? */
  why: string;
  /** 3. Clients and versions affected. */
  affectedClientsVersions: string;
  /** 4. Introduced by — a release, a pull request or a change, in words. */
  introducedBy: string;
  /** 5. Workaround offered while the fix was being made. */
  workaround: string;
  /** 6. Permanent solution. */
  permanentFix: string;
  /** 7. Prevention. */
  prevention: string;
  /** 8. Tests added. */
  testsAdded: string;
  /** 9. Owner. */
  owner: UserRefLite | null;
  /** 10. Target date. */
  targetDate: string | null;
  /** The release this analysis blames, when one was named. */
  introducedByRelease: { id: string; version: string } | null;
  submittedBy: UserRefLite | null;
  submittedAt: string | null;
  approvedBy: UserRefLite | null;
  approvedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A corrective or preventive action, pointed at a real task rather than a second to-do system. */
export interface RcaAction {
  id: string;
  kind: 'CORRECTIVE' | 'PREVENTIVE';
  description: string;
  owner: UserRefLite | null;
  dueDate: string | null;
  /** The task doing the work. Actions are tracked as tasks; this is the link, not a copy. */
  task: { id: string; key: string; title: string; status: string } | null;
  completedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: UserRefLite | null;
  createdAt: string;
}

/** Everything the close button needs to explain itself, computed on the server. */
export interface ProblemClosureState {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
}

export interface ProblemDetail extends ProblemSummary {
  description: string | null;
  tickets: ProblemTicketLink[];
  questions: ProblemQuestion[];
  rca: RcaReport | null;
  actions: RcaAction[];
  fixTask: { id: string; key: string; title: string; status: string } | null;
  preventiveTestTask: { id: string; key: string; title: string; status: string } | null;
  preventiveTest: string | null;
  incidents: IncidentSummary[];
  closure: ProblemClosureState;
  rcaDueDate: string | null;
  createdBy: UserRefLite | null;
}

export interface CreateProblemInput {
  title: string;
  description?: string;
  severity?: Priority;
  projectId?: string;
  productId?: string;
  module?: string;
  /** Tickets to link on creation. The first one's project and product fill the blanks. */
  ticketIds?: string[];
  relation?: ProblemTicketRelation;
}

export interface UpdateProblemInput {
  title?: string;
  description?: string;
  severity?: Priority;
  module?: string;
  ownerId?: string | null;
}

/* ------------------------------------------------------------------ incidents */

export interface IncidentSummary {
  id: string;
  /** "INC-4". */
  key: string;
  number: number;
  title: string;
  status: IncidentStatus;
  severity: Priority;
  impact: string | null;
  owner: UserRefLite | null;
  project: { id: string; code: string; name: string } | null;
  product: { id: string; code: string; name: string } | null;
  problemId: string | null;
  emergencyFixStatus: EmergencyFixStatus;
  startedAt: string;
  detectedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  /** Minutes between `startedAt` and `resolvedAt`, or to now while it is still open. */
  durationMinutes: number;
  createdAt: string;
}

export interface IncidentTimelineEntry {
  id: string;
  kind: IncidentTimelineKind;
  body: string;
  actor: UserRefLite | null;
  occurredAt: string;
}

export interface IncidentLink {
  id: string;
  kind: IncidentLinkKind;
  entityId: string;
  /** "T-18", "AD-127", "v3.2.0" — enough to render without a second request. */
  label: string;
  addedBy: UserRefLite | null;
  addedAt: string;
}

export interface IncidentDetail extends IncidentSummary {
  description: string;
  /** Internal only, and there is no client shape that carries it. */
  internalNotes: string | null;
  /**
   * What a client may be told, when somebody decided to tell them.
   *
   * Written by a person and published by a person: nothing generates this and nothing publishes it
   * automatically. Until `clientSummaryPublishedAt` is set it reaches no client, and even then it
   * reaches only the clients whose project the incident names.
   */
  clientSummary: string | null;
  clientSummaryPublishedAt: string | null;
  emergencyFixReason: string | null;
  emergencyFixRequestedBy: UserRefLite | null;
  emergencyFixDecidedBy: UserRefLite | null;
  emergencyFixDecidedAt: string | null;
  timeline: IncidentTimelineEntry[];
  links: IncidentLink[];
  resolution: string | null;
}

export interface CreateIncidentInput {
  title: string;
  description: string;
  severity: Priority;
  impact?: string;
  projectId?: string;
  productId?: string;
  problemId?: string;
  ticketId?: string;
  /** When the impact actually began, if it is known to be earlier than now. */
  startedAt?: string;
  ownerId?: string;
}

/* ------------------------------------------------------------------ recurring report */

export interface RecurringGroupRow {
  /** The grouping value: a product name, a module, a version, or a severity label. */
  label: string;
  productId: string | null;
  module: string | null;
  productVersion: string | null;
  severity: Priority | null;
  /** Tickets raised inside the report window. Also what the frequency bar is drawn from. */
  ticketCount: number;
  /** Separate client organizations that reported inside the window, never tickets. */
  clientCount: number;
  /** Problems already open for this group. */
  problems: { id: string; key: string; status: ProblemStatus }[];
  /** True when `clientCount` has reached the configured threshold. */
  overThreshold: boolean;
}

export interface RecurringReport {
  groupBy: RecurringGroupBy;
  /**
   * Days every count on the report covers.
   *
   * One window, not two. A row is "over threshold" because separate clients hit it *recently*;
   * counting the clients over all of history and the frequency bar over a month would put a red
   * badge on a fault three clients last saw in three different years.
   */
  windowDays: number;
  threshold: number;
  rows: RecurringGroupRow[];
  generatedAt: string;
}
