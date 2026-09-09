import { PROBLEM_STATUS, type ProblemStatus } from './problem-status';

/**
 * The problem lifecycle, as one pure function per question.
 *
 * `PROBLEM_STATUS` has existed since Phase 0 with no rules attached to it. The rules are here
 * rather than in the service for the usual reason — every branch can be tested without a database —
 * and because two of them are answers a *screen* needs before anything is clicked: the approved
 * design disables "Close problem" and shows the sentence "Close needs RCA + fix verified live"
 * underneath it. A disabled button whose reason is computed on the server and sent to the client is
 * the only way that sentence and the server's actual refusal cannot drift apart.
 */

/**
 * Where each status may go.
 *
 * `RCA_REQUESTED → FIX_ASSIGNED` is allowed on purpose: the cause is sometimes obvious long before
 * the write-up is finished, and blocking the fix until the paperwork lands would be the wrong way
 * round. The RCA is still owed, and `problemClosureGate` is what makes sure it is not forgotten.
 */
export const PROBLEM_STATUS_TRANSITIONS: Record<ProblemStatus, readonly ProblemStatus[]> = {
  OPEN: [PROBLEM_STATUS.RCA_REQUESTED, PROBLEM_STATUS.FIX_ASSIGNED, PROBLEM_STATUS.CLOSED],
  RCA_REQUESTED: [PROBLEM_STATUS.RCA_SUBMITTED, PROBLEM_STATUS.FIX_ASSIGNED],
  RCA_SUBMITTED: [PROBLEM_STATUS.FIX_ASSIGNED, PROBLEM_STATUS.RCA_REQUESTED, PROBLEM_STATUS.CLOSED],
  FIX_ASSIGNED: [
    PROBLEM_STATUS.FIX_RELEASED,
    PROBLEM_STATUS.RCA_REQUESTED,
    PROBLEM_STATUS.RCA_SUBMITTED,
  ],
  FIX_RELEASED: [PROBLEM_STATUS.CLOSED, PROBLEM_STATUS.FIX_ASSIGNED],
  CLOSED: [],
};

export function canMoveProblem(from: ProblemStatus, to: ProblemStatus): boolean {
  return PROBLEM_STATUS_TRANSITIONS[from].includes(to);
}

/** Statuses in which a problem is still somebody's work. */
export const OPEN_PROBLEM_STATUSES: readonly ProblemStatus[] = [
  PROBLEM_STATUS.OPEN,
  PROBLEM_STATUS.RCA_REQUESTED,
  PROBLEM_STATUS.RCA_SUBMITTED,
  PROBLEM_STATUS.FIX_ASSIGNED,
  PROBLEM_STATUS.FIX_RELEASED,
];

export function isProblemOpen(status: ProblemStatus): boolean {
  return status !== PROBLEM_STATUS.CLOSED;
}

/** Statuses the "RCA in progress" filter chip on the problems screen selects. */
export const RCA_IN_PROGRESS_STATUSES: readonly ProblemStatus[] = [
  PROBLEM_STATUS.RCA_REQUESTED,
  PROBLEM_STATUS.RCA_SUBMITTED,
];

/** What the closure gate was given to decide on. Every field is a fact, never an opinion. */
export interface ProblemClosureFacts {
  /** An RCA exists and has been submitted (a draft does not count). */
  rcaSubmitted: boolean;
  /** A permanent fix task exists. */
  fixAssigned: boolean;
  /** That fix task reached Completed — the design's "verified live". */
  fixVerified: boolean;
  /** A preventive test was recorded. Advisory: it is reported, it does not block. */
  preventiveTestAdded: boolean;
}

export interface ProblemClosureDecision {
  allowed: boolean;
  /** Everything still outstanding, in the order the checklist shows it. Empty when allowed. */
  blockers: readonly string[];
  /** Outstanding work that is reported but does not block. */
  warnings: readonly string[];
}

/**
 * Whether a problem may be closed, and what is missing when it may not.
 *
 * Two hard requirements, from the approved design: the RCA has been submitted, and the permanent
 * fix has been verified live. A preventive test is checklisted but does not block — it is often
 * written by a different person on a different day, and holding the problem open for it would only
 * teach people to tick it dishonestly.
 */
export function problemClosureGate(facts: ProblemClosureFacts): ProblemClosureDecision {
  const blockers: string[] = [];
  if (!facts.rcaSubmitted) {
    blockers.push('The root-cause analysis has not been submitted yet.');
  }
  if (!facts.fixAssigned) {
    blockers.push('No permanent fix has been assigned.');
  } else if (!facts.fixVerified) {
    blockers.push('The permanent fix has not been verified live.');
  }

  const warnings = facts.preventiveTestAdded ? [] : ['No preventive test has been added.'];

  return { allowed: blockers.length === 0, blockers, warnings };
}

/** How a ticket relates to a problem. Both are links; only one of them means "the same fault". */
export const PROBLEM_TICKET_RELATION = {
  DUPLICATE: 'DUPLICATE',
  RELATED: 'RELATED',
} as const;

export type ProblemTicketRelation =
  (typeof PROBLEM_TICKET_RELATION)[keyof typeof PROBLEM_TICKET_RELATION];

export const PROBLEM_TICKET_RELATION_LABELS: Record<ProblemTicketRelation, string> = {
  DUPLICATE: 'Duplicate',
  RELATED: 'Related',
};

/**
 * Whether a group of tickets has crossed the duplicate threshold.
 *
 * Counted in **distinct client organizations**, never in tickets. Three reports from one client is
 * one client with a persistent problem; three reports from three clients is a fault in the product,
 * and only the second one is what "reported by N clients" means on screen.
 */
export function crossesDuplicateThreshold(
  clientOrganizationIds: readonly string[],
  threshold: number,
): boolean {
  if (threshold <= 0) {
    return false;
  }
  return new Set(clientOrganizationIds).size >= threshold;
}

/** The default the approved support settings show when a project has not chosen one. */
export const DEFAULT_DUPLICATE_THRESHOLD = 3;
