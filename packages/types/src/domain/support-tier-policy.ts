import type { Priority } from './priority';
import type { SupportTier } from './product';

/**
 * What a support tier is worth, as configuration rather than as code.
 *
 * `supportTier` has been recorded on every product since the registry shipped, with the comment
 * "Recorded now; priced later", and until now exactly one line in the codebase read it: the IVR
 * policy's `allowedTiers`. Everything else stored it, mapped it or displayed it.
 *
 * This is what turns it into behaviour — and deliberately only into *behaviour*. There is no
 * amount here, no currency, no billing link and no opinion about which tier ought to get what.
 * What a tier is worth commercially is a decision somebody makes per organization and records in
 * these rows; hard-coding one would make every customer's pricing a deployment.
 *
 * **Absence is the neutral answer, everywhere.** A tier with no row behaves exactly as it did
 * before this file existed, and a null field leaves that one aspect alone. This is the same
 * convention `ProductIvrPolicy.allowedTiers` already uses, where an empty list means every tier:
 * an unconfigured policy must never be read as a restrictive one, or shipping the feature would
 * silently close support for every customer who had not configured it yet.
 */

/**
 * Where a ticket goes when the routing chain and escalation both come up empty.
 *
 * **Recorded, not yet enacted.** Nothing reads this: an unanswered ticket stays in the support
 * queue whichever value is set. Acting on `NOTIFY_EXECUTIVE` would change *who* gets told about a
 * ticket, which is a routing decision and would have to come with a `ROUTING_POLICY_VERSION` bump
 * so that existing routing trails stay interpretable. Until then it is what a tier's support
 * agreement says, and the screens say so too.
 */
export const SUPPORT_FALLBACK_STRATEGY = {
  /** Leave it in the support queue with a reason on it. What every tier does today. */
  SUPPORT_QUEUE: 'SUPPORT_QUEUE',
  /** Also notify the support executive at once, rather than waiting for the escalation timer. */
  NOTIFY_EXECUTIVE: 'NOTIFY_EXECUTIVE',
} as const;

export type SupportFallbackStrategy =
  (typeof SUPPORT_FALLBACK_STRATEGY)[keyof typeof SUPPORT_FALLBACK_STRATEGY];

/**
 * When a tier's entitlements apply.
 *
 * Recorded, not yet enacted, for the same reason as the fallback strategy above: the SLA clock and
 * the router follow the selected SLA policy's business hours, and neither consults this.
 */
export const SUPPORT_AVAILABILITY_WINDOW = {
  /** The SLA policy's business hours, which is what an unconfigured tier already gets. */
  BUSINESS_HOURS: 'BUSINESS_HOURS',
  ALWAYS: 'ALWAYS',
} as const;

export type SupportAvailabilityWindow =
  (typeof SUPPORT_AVAILABILITY_WINDOW)[keyof typeof SUPPORT_AVAILABILITY_WINDOW];

export const SUPPORT_FALLBACK_STRATEGY_LABELS: Record<SupportFallbackStrategy, string> = {
  SUPPORT_QUEUE: 'Support queue',
  NOTIFY_EXECUTIVE: 'Support queue, and tell the support executive at once',
};

export const SUPPORT_AVAILABILITY_WINDOW_LABELS: Record<SupportAvailabilityWindow, string> = {
  BUSINESS_HOURS: 'Business hours',
  ALWAYS: 'Around the clock',
};

/** One tier's configured behaviour. Every optional field means "leave this as it was". */
export interface SupportTierPolicy {
  tier: SupportTier;
  admissionEnabled: boolean;
  slaPolicyId: string | null;
  minimumPriority: Priority | null;
  callsEnabled: boolean;
  requesterInitiatedCalls: boolean;
  /** Recorded for the support agreement; nothing reads it, so it changes no assignment. */
  dedicatedOwnership: boolean;
  ackMinutes: number | null;
  escalationMinutes: number | null;
  fallbackStrategy: SupportFallbackStrategy;
  availabilityWindow: SupportAvailabilityWindow;
}

/**
 * What every tier gets when nobody has configured anything.
 *
 * Every field is the behaviour that already existed: support is open, calls are offered, the
 * project's own acknowledgement and escalation minutes stand, no SLA policy is selected and no
 * priority is forced. Reading an unconfigured tier therefore changes nothing at all, which is the
 * only safe way to add a policy layer to a system already carrying live tickets.
 */
export function neutralTierPolicy(tier: SupportTier): SupportTierPolicy {
  return {
    tier,
    admissionEnabled: true,
    slaPolicyId: null,
    minimumPriority: null,
    callsEnabled: true,
    requesterInitiatedCalls: true,
    dedicatedOwnership: false,
    ackMinutes: null,
    escalationMinutes: null,
    fallbackStrategy: SUPPORT_FALLBACK_STRATEGY.SUPPORT_QUEUE,
    availabilityWindow: SUPPORT_AVAILABILITY_WINDOW.BUSINESS_HOURS,
  };
}

/**
 * The policy in force for one tier.
 *
 * Pure, and here rather than in a service, because three places have to agree about it — the
 * ingress that admits a ticket, the router that sets its deadlines, and the screen that explains
 * to an administrator what a tier currently does. A second copy would drift, and a drifted copy of
 * an entitlement rule shows a customer one thing and charges them for another.
 */
export function resolveTierPolicy(
  rows: readonly SupportTierPolicy[],
  tier: SupportTier,
): SupportTierPolicy {
  return rows.find((row) => row.tier === tier) ?? neutralTierPolicy(tier);
}

/**
 * The acknowledgement and escalation minutes a ticket of this tier should get.
 *
 * Takes the project's configured values and returns what the router should actually use. This
 * changes *when* a ticket escalates and never *who* it reaches, which is why the routing chain,
 * the eligibility rules and therefore `ROUTING_POLICY_VERSION` are untouched by it.
 */
export function tierTiming(
  policy: SupportTierPolicy,
  projectAckMinutes: number,
  projectEscalationMinutes: number,
): { ackMinutes: number; escalationMinutes: number } {
  return {
    ackMinutes: policy.ackMinutes ?? projectAckMinutes,
    escalationMinutes: policy.escalationMinutes ?? projectEscalationMinutes,
  };
}
