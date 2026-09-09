/**
 * Who a support call should reach.
 *
 * This is **not** a second routing engine, and it is important that it is not. Package 8b decides
 * who is eligible for a ticket: it reads support ownership, the rota, working hours, leave,
 * workload and manual overrides, and `planRouting` turns all of that into an answer. A call has no
 * business re-deciding any of it — a developer who is on leave is on leave whether the thing
 * arriving is a ticket or a telephone.
 *
 * So this file adds exactly one rule on top of 8b's answer, the one a call has and a ticket does
 * not: **the person already on the ticket is rung first**. Somebody calling about their ticket
 * wants the person handling it, not whoever the chain would pick today. Everything after that is
 * `planRouting`'s answer, then escalation's, then the configured fallback, then a person.
 *
 * Fallback works by asking 8b again with the tried destinations added to `previouslyAssigned` —
 * the same mechanism a re-routed ticket uses. That is why there is no eligibility logic here: the
 * "next eligible" person is whoever `planRouting` names once the ones who did not answer are
 * excluded, which is the definition, computed by the code that owns the definition.
 */

import { ROUTING_OUTCOME, type RoutingPlan, type RoutingRole } from './ticket-routing';

/** Which rung of the ladder a destination came from. Recorded on every attempt. */
export const CALL_ROUTING_STEP = {
  /** The person the ticket is already assigned to, including a manual assignment. */
  ASSIGNED_OWNER: 'ASSIGNED_OWNER',
  /** Package 8b's routing answer: module owner, primary, on-call, backup. */
  ROUTING_CHAIN: 'ROUTING_CHAIN',
  /** Package 8b's escalation answer: backup, senior, support executive. */
  ESCALATION: 'ESCALATION',
  /** The destination named on the product's IVR policy or the project's routing configuration. */
  POLICY_FALLBACK: 'POLICY_FALLBACK',
  /** Nobody left to ring. The call stops and the support queue is told why. */
  SUPPORT_QUEUE: 'SUPPORT_QUEUE',
} as const;

export type CallRoutingStep = (typeof CALL_ROUTING_STEP)[keyof typeof CALL_ROUTING_STEP];

export const CALL_ROUTING_STEP_LABELS: Record<CallRoutingStep, string> = {
  ASSIGNED_OWNER: 'Assigned owner',
  ROUTING_CHAIN: 'Routing chain',
  ESCALATION: 'Escalation',
  POLICY_FALLBACK: 'Configured fallback',
  SUPPORT_QUEUE: 'Support queue',
};

/** The ticket's current assignee, as availability sees them. Null when nobody holds it. */
export interface CallAssigneeInput {
  userId: string;
  /** Package 8a's single availability answer — the same one routing uses. */
  available: boolean;
  unavailableReason: 'ON_LEAVE' | 'OUT_OF_HOURS' | 'AT_WORKLOAD_LIMIT' | null;
  /** False when they have left the project or the tenant since being assigned. */
  isActive: boolean;
}

export interface CallTargetInput {
  assignee: CallAssigneeInput | null;
  /**
   * Package 8b's decision for this ticket, computed with `alreadyTried` already in
   * `previouslyAssigned`. Null when the ticket has no project to route against.
   */
  plan: RoutingPlan | null;
  /** Package 8b's escalation decision, computed the same way. Null when there is none to make. */
  escalation: RoutingPlan | null;
  /** The product's configured destination, or the project's, or null. */
  fallbackUserId: string | null;
  /** True when the fallback user is an active member who could actually take a call. */
  fallbackEligible: boolean;
  /** Destinations this call has already rung. Nobody is rung twice for one call. */
  alreadyTried: readonly string[];
  attemptsUsed: number;
  maxAttempts: number;
}

export interface CallTargetDecision {
  step: CallRoutingStep;
  /** Null only for `SUPPORT_QUEUE`, which is the absence of a destination. */
  userId: string | null;
  /** The chain position the destination came from, when 8b named one. */
  role: RoutingRole | null;
  /** Why this destination, or why none. Stored on the attempt and shown in the call history. */
  reason: string;
}

function unavailableWord(reason: CallAssigneeInput['unavailableReason']): string {
  switch (reason) {
    case 'ON_LEAVE':
      return 'is on leave';
    case 'OUT_OF_HOURS':
      return 'is outside their working hours';
    case 'AT_WORKLOAD_LIMIT':
      return 'is at their workload limit';
    default:
      return 'is not available';
  }
}

function acceptedRole(plan: RoutingPlan): RoutingRole | null {
  return plan.trail.find((entry) => entry.accepted)?.role ?? null;
}

/**
 * Pick the next destination for a call, or say that there is none.
 *
 * Called once when the call is placed and again after every attempt that found nobody, with the
 * failed destinations accumulated in `alreadyTried`. It never returns the same person twice, and
 * it always returns *something* — `SUPPORT_QUEUE` when it has run out — because a support call
 * that quietly evaporates is the one outcome this whole package exists to prevent.
 */
export function planCallTarget(input: CallTargetInput): CallTargetDecision {
  const tried = new Set(input.alreadyTried);

  if (input.attemptsUsed >= input.maxAttempts) {
    return {
      step: CALL_ROUTING_STEP.SUPPORT_QUEUE,
      userId: null,
      role: null,
      reason: `Tried ${input.attemptsUsed} destination${input.attemptsUsed === 1 ? '' : 's'} without an answer`,
    };
  }

  // 1. The person already on the ticket. A manual assignment lands here too, which is how a
  //    person's decision keeps outranking the chain's for calls as well as for tickets.
  const assignee = input.assignee;
  if (assignee && !tried.has(assignee.userId)) {
    if (assignee.isActive && assignee.available) {
      return {
        step: CALL_ROUTING_STEP.ASSIGNED_OWNER,
        userId: assignee.userId,
        role: null,
        reason: 'Assigned to this ticket and available',
      };
    }
    // Not a dead end — just not this person. Recorded so the fallback has a stated cause.
    tried.add(assignee.userId);
  }

  const assigneeNote =
    assignee && !input.alreadyTried.includes(assignee.userId) && !assignee.available
      ? `The assigned owner ${unavailableWord(assignee.unavailableReason)}. `
      : '';

  // 2. Whoever routing would pick now, with everyone already rung excluded.
  const plan = input.plan;
  if (
    plan &&
    plan.outcome === ROUTING_OUTCOME.AUTO_ASSIGNED &&
    plan.assignedUserId &&
    !tried.has(plan.assignedUserId)
  ) {
    return {
      step: CALL_ROUTING_STEP.ROUTING_CHAIN,
      userId: plan.assignedUserId,
      role: acceptedRole(plan),
      reason: `${assigneeNote}Next eligible in the routing chain`,
    };
  }

  // 3. Escalation: the backup, the senior, the support executive.
  const escalation = input.escalation;
  if (
    escalation &&
    escalation.outcome === ROUTING_OUTCOME.AUTO_ASSIGNED &&
    escalation.assignedUserId &&
    !tried.has(escalation.assignedUserId)
  ) {
    return {
      step: CALL_ROUTING_STEP.ESCALATION,
      userId: escalation.assignedUserId,
      role: acceptedRole(escalation),
      reason: `${assigneeNote}No one in the routing chain was reachable; escalated`,
    };
  }

  // 4. The destination somebody configured for exactly this situation.
  if (input.fallbackUserId && input.fallbackEligible && !tried.has(input.fallbackUserId)) {
    return {
      step: CALL_ROUTING_STEP.POLICY_FALLBACK,
      userId: input.fallbackUserId,
      role: null,
      reason: `${assigneeNote}Configured fallback destination`,
    };
  }

  // 5. Nobody. The call ends and the support queue is told, with the reason routing gave.
  const queueReason =
    plan?.queueReason ?? escalation?.queueReason ?? 'No one was available to take the call';
  return {
    step: CALL_ROUTING_STEP.SUPPORT_QUEUE,
    userId: null,
    role: null,
    reason: `${assigneeNote}${queueReason}`,
  };
}
