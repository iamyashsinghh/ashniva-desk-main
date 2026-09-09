/**
 * The support routing decision: who should get this ticket, and why not everybody else.
 *
 * The chain is the one the architecture already specifies (§19.1, `product-requirements.md` row 5,
 * and the stub that shipped in Phase 0): **module owner → primary → on-call → backup**, with
 * senior and support executive reached by escalation rather than by first-pass routing. That order
 * is deliberate and is not the same as "most senior first": a ticket about billing should reach
 * whoever owns billing before it reaches anybody's manager.
 *
 * This file is pure and lives in `packages/types` because three places have to agree about it —
 * the router, the screen that explains a decision, and the tests. A second copy would drift.
 */

/** Why a candidate was in the running at all. Also the order they are tried in. */
export const ROUTING_ROLE = {
  MODULE_OWNER: 'MODULE_OWNER',
  PRIMARY_DEVELOPER: 'PRIMARY_DEVELOPER',
  ON_CALL: 'ON_CALL',
  BACKUP_DEVELOPER: 'BACKUP_DEVELOPER',
  /** Escalation only: reached when the chain above produced nobody, or on a timer. */
  SENIOR: 'SENIOR',
  SUPPORT_EXECUTIVE: 'SUPPORT_EXECUTIVE',
} as const;

export type RoutingRole = (typeof ROUTING_ROLE)[keyof typeof ROUTING_ROLE];

/** The first-pass chain, in order. Senior and support executive are not in it — see above. */
export const ROUTING_CHAIN: readonly RoutingRole[] = [
  ROUTING_ROLE.MODULE_OWNER,
  ROUTING_ROLE.PRIMARY_DEVELOPER,
  ROUTING_ROLE.ON_CALL,
  ROUTING_ROLE.BACKUP_DEVELOPER,
];

/** Who an escalation reaches, in order, once the first-pass chain has been exhausted. */
export const ESCALATION_CHAIN: readonly RoutingRole[] = [
  ROUTING_ROLE.BACKUP_DEVELOPER,
  ROUTING_ROLE.SENIOR,
  ROUTING_ROLE.SUPPORT_EXECUTIVE,
];

export const ROUTING_ROLE_LABELS: Record<RoutingRole, string> = {
  MODULE_OWNER: 'Module owner',
  PRIMARY_DEVELOPER: 'Primary developer',
  ON_CALL: 'On call',
  BACKUP_DEVELOPER: 'Backup developer',
  SENIOR: 'Senior / team lead',
  SUPPORT_EXECUTIVE: 'Support executive',
};

/**
 * Machine-readable reasons a candidate was passed over.
 *
 * The first three are the ones package 8a's resolver already produces and that
 * `RoutingDecision.trail` has always named, so a skip for availability speaks the same word from
 * the rota all the way to the audit history. The rest are routing's own.
 */
export const ROUTING_SKIP_REASON = {
  ON_LEAVE: 'ON_LEAVE',
  OUT_OF_HOURS: 'OUT_OF_HOURS',
  AT_WORKLOAD_LIMIT: 'AT_WORKLOAD_LIMIT',
  /** Configured for the role, but no longer on this project. */
  NOT_PROJECT_MEMBER: 'NOT_PROJECT_MEMBER',
  /** Considered as a module owner, but does not hold the ticket's work area. */
  WORK_AREA_MISMATCH: 'WORK_AREA_MISMATCH',
  /** Nobody is configured in this position. */
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  /** Already tried earlier in the chain; one person is not two candidates. */
  ALREADY_CONSIDERED: 'ALREADY_CONSIDERED',
  /** Deactivated, deleted, or no longer a member of the tenant. */
  INACTIVE: 'INACTIVE',
  /** They raised it. Routing a ticket back to its reporter helps nobody. */
  IS_REQUESTER: 'IS_REQUESTER',
  /** Tried on an earlier attempt of this same ticket and did not work out. */
  PREVIOUSLY_ASSIGNED: 'PREVIOUSLY_ASSIGNED',
} as const;

export type RoutingSkipReason = (typeof ROUTING_SKIP_REASON)[keyof typeof ROUTING_SKIP_REASON];

export const ROUTING_SKIP_REASON_LABELS: Record<RoutingSkipReason, string> = {
  ON_LEAVE: 'On leave',
  OUT_OF_HOURS: 'Outside their working hours',
  AT_WORKLOAD_LIMIT: 'At their workload limit',
  NOT_PROJECT_MEMBER: 'Not a member of this project',
  WORK_AREA_MISMATCH: 'Does not cover this work area',
  NOT_CONFIGURED: 'Nobody is configured for this role',
  ALREADY_CONSIDERED: 'Already considered earlier in the chain',
  INACTIVE: 'No longer an active member',
  IS_REQUESTER: 'Raised this ticket',
  PREVIOUSLY_ASSIGNED: 'Already tried on an earlier attempt',
};

/** What routing did with the ticket. */
export const ROUTING_OUTCOME = {
  AUTO_ASSIGNED: 'AUTO_ASSIGNED',
  /** Nobody eligible, or the type is not a direct one: it waits in the support queue. */
  SUPPORT_QUEUE: 'SUPPORT_QUEUE',
  /** The project turned automatic routing off. A person assigns it. */
  DISABLED: 'DISABLED',
  /** Somebody assigned it by hand; the router must not undo that. */
  MANUAL: 'MANUAL',
} as const;

export type RoutingOutcome = (typeof ROUTING_OUTCOME)[keyof typeof ROUTING_OUTCOME];

export const ROUTING_OUTCOME_LABELS: Record<RoutingOutcome, string> = {
  AUTO_ASSIGNED: 'Auto-assigned',
  SUPPORT_QUEUE: 'In the support queue',
  DISABLED: 'Automatic routing is off',
  MANUAL: 'Assigned by hand',
};

/**
 * Bumped whenever the meaning of a decision changes, and stamped on every trail row.
 *
 * A trail read a year from now has to be interpretable against the rules that produced it, not
 * against today's. Without this, a change to the chain silently rewrites the past.
 */
export const ROUTING_POLICY_VERSION = 1;

/** One person as routing sees them. Everything here is resolved by the caller before deciding. */
export interface RoutingCandidateInput {
  userId: string;
  role: RoutingRole;
  /** False when the configured person has since left the project. */
  isProjectMember: boolean;
  isActive: boolean;
  /** Work areas this person holds on the project, already normalized. */
  workAreas: readonly string[];
  /** The single availability answer from package 8a's resolver. */
  available: boolean;
  unavailableReason: 'ON_LEAVE' | 'OUT_OF_HOURS' | 'AT_WORKLOAD_LIMIT' | null;
}

export interface RoutingContext {
  /** The ticket's module or work area, already normalized. Null when it names none. */
  workArea: string | null;
  requesterId: string;
  /** People already tried on an earlier attempt of this ticket. */
  previouslyAssigned?: readonly string[];
  /** False when the project switched automatic routing off. */
  autoRouteEnabled: boolean;
  /** True when this ticket's type is one the project sends straight to a developer. */
  isDirectType: boolean;
}

export interface RoutingTrailEntry {
  position: number;
  userId: string | null;
  role: RoutingRole;
  accepted: boolean;
  skipReason: RoutingSkipReason | null;
  /** Human-readable, for the screen. The code above is what anything else should branch on. */
  detail: string;
}

export interface RoutingPlan {
  outcome: RoutingOutcome;
  assignedUserId: string | null;
  trail: RoutingTrailEntry[];
  policyVersion: number;
  /** Why the ticket ended up in the queue, when it did. Null on a successful assignment. */
  queueReason: string | null;
}

function skip(
  position: number,
  candidate: RoutingCandidateInput,
  reason: RoutingSkipReason,
): RoutingTrailEntry {
  return {
    position,
    userId: candidate.userId,
    role: candidate.role,
    accepted: false,
    skipReason: reason,
    detail: `${ROUTING_ROLE_LABELS[candidate.role]}: ${ROUTING_SKIP_REASON_LABELS[reason]}`,
  };
}

/**
 * Decide, from candidates already in chain order, who gets the ticket.
 *
 * The checks per candidate run cheapest-and-most-decisive first — membership, then work area,
 * then availability — because the reason recorded should be the *first* thing that disqualified
 * somebody, not whichever check happened to run last. Somebody who left the project is reported
 * as having left it, not as being outside working hours.
 *
 * A candidate is never silently dropped: every one of them produces a trail row, and a role with
 * nobody configured produces a `NOT_CONFIGURED` row so the gap in the configuration is visible
 * rather than invisible.
 */
export function planRouting(
  candidates: readonly RoutingCandidateInput[],
  context: RoutingContext,
): RoutingPlan {
  const base = { policyVersion: ROUTING_POLICY_VERSION };

  if (!context.autoRouteEnabled) {
    return {
      ...base,
      outcome: ROUTING_OUTCOME.DISABLED,
      assignedUserId: null,
      trail: [],
      queueReason: 'Automatic routing is switched off for this project',
    };
  }
  if (!context.isDirectType) {
    return {
      ...base,
      outcome: ROUTING_OUTCOME.SUPPORT_QUEUE,
      assignedUserId: null,
      trail: [],
      queueReason: 'This ticket type goes to the support queue rather than straight to a developer',
    };
  }

  const trail: RoutingTrailEntry[] = [];
  const seen = new Set<string>();
  const previously = new Set(context.previouslyAssigned ?? []);
  let position = 0;

  for (const candidate of candidates) {
    position += 1;
    if (!candidate.userId) {
      trail.push({
        position,
        userId: null,
        role: candidate.role,
        accepted: false,
        skipReason: ROUTING_SKIP_REASON.NOT_CONFIGURED,
        detail: `${ROUTING_ROLE_LABELS[candidate.role]}: nobody is configured`,
      });
      continue;
    }
    if (seen.has(candidate.userId)) {
      trail.push(skip(position, candidate, ROUTING_SKIP_REASON.ALREADY_CONSIDERED));
      continue;
    }
    seen.add(candidate.userId);

    if (!candidate.isActive) {
      trail.push(skip(position, candidate, ROUTING_SKIP_REASON.INACTIVE));
      continue;
    }
    if (candidate.userId === context.requesterId) {
      trail.push(skip(position, candidate, ROUTING_SKIP_REASON.IS_REQUESTER));
      continue;
    }
    if (!candidate.isProjectMember) {
      trail.push(skip(position, candidate, ROUTING_SKIP_REASON.NOT_PROJECT_MEMBER));
      continue;
    }
    if (previously.has(candidate.userId)) {
      trail.push(skip(position, candidate, ROUTING_SKIP_REASON.PREVIOUSLY_ASSIGNED));
      continue;
    }
    // Only a module owner is required to hold the work area. The rest of the chain is the
    // fallback *for* the case where nobody owns it, so applying the same test there would empty
    // the chain exactly when it is most needed.
    if (
      candidate.role === ROUTING_ROLE.MODULE_OWNER &&
      context.workArea !== null &&
      !candidate.workAreas.includes(context.workArea)
    ) {
      trail.push(skip(position, candidate, ROUTING_SKIP_REASON.WORK_AREA_MISMATCH));
      continue;
    }
    if (!candidate.available) {
      trail.push(skip(position, candidate, candidate.unavailableReason ?? 'OUT_OF_HOURS'));
      continue;
    }

    trail.push({
      position,
      userId: candidate.userId,
      role: candidate.role,
      accepted: true,
      skipReason: null,
      detail: `${ROUTING_ROLE_LABELS[candidate.role]}: available and eligible`,
    });
    return {
      ...base,
      outcome: ROUTING_OUTCOME.AUTO_ASSIGNED,
      assignedUserId: candidate.userId,
      trail,
      queueReason: null,
    };
  }

  return {
    ...base,
    outcome: ROUTING_OUTCOME.SUPPORT_QUEUE,
    assignedUserId: null,
    trail,
    queueReason:
      trail.length === 0
        ? 'This project has no support ownership configured'
        : 'Every candidate in the chain was unavailable',
  };
}
