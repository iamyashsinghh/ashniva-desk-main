import {
  neutralTierPolicy,
  type Priority,
  type SupportAvailabilityWindow,
  type SupportFallbackStrategy,
  type SupportTier,
  type SupportTierPolicySummary,
} from '@ashniva/types';

import type { SupportTierPolicyRow } from './support-tier-policies.repository';

/**
 * Rows into API shapes.
 *
 * `configured` is the field that matters: without it a screen cannot tell a tier that was
 * deliberately set to the same values as the defaults from one nobody has touched, and those are
 * different statements to an administrator deciding what to change.
 */
export function toTierPolicySummary(row: SupportTierPolicyRow): SupportTierPolicySummary {
  return {
    tier: row.tier as SupportTier,
    admissionEnabled: row.admissionEnabled,
    slaPolicy: row.slaPolicy ? { id: row.slaPolicy.id, name: row.slaPolicy.name } : null,
    minimumPriority: row.minimumPriority as Priority | null,
    callsEnabled: row.callsEnabled,
    requesterInitiatedCalls: row.requesterInitiatedCalls,
    dedicatedOwnership: row.dedicatedOwnership,
    ackMinutes: row.ackMinutes,
    escalationMinutes: row.escalationMinutes,
    fallbackStrategy: row.fallbackStrategy as SupportFallbackStrategy,
    availabilityWindow: row.availabilityWindow as SupportAvailabilityWindow,
    configured: true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A tier nobody has configured, shown with the behaviour it is actually running on. */
export function neutralSummary(tier: SupportTier): SupportTierPolicySummary {
  const { slaPolicyId: _unselected, ...policy } = neutralTierPolicy(tier);
  return { ...policy, slaPolicy: null, configured: false, updatedAt: null };
}
