import { Injectable } from '@nestjs/common';
import {
  SUPPORT_TIER_LABELS,
  neutralTierPolicy,
  resolveTierPolicy,
  type Priority,
  type SupportAvailabilityWindow,
  type SupportFallbackStrategy,
  type SupportTier,
  type SupportTierPolicy,
} from '@ashniva/types';

import {
  SupportTierPoliciesRepository,
  type SupportTierPolicyRow,
} from './support-tier-policies.repository';

/**
 * What a tier currently entitles a product to.
 *
 * Read-only, and separate from the admin service on purpose: resolving an entitlement happens on
 * the ingress, in the router, in the SLA clock and in the widget, while editing one happens on a
 * settings screen. Keeping the read path free of the write path's dependencies is what lets this
 * be a global provider that nobody has to remember to import.
 *
 * Refusals are returned as sentences rather than thrown, copying `calls.service.refusalFor`: the
 * same answer drives the API's refusal and the screen's disabled control, and a disabled control
 * that cannot say why is only slightly better than one that lies. The one caller that must not
 * explain itself — the external ingress, whose refusals are uniform by design — throws its own.
 */
@Injectable()
export class SupportTierPolicyService {
  constructor(private readonly policies: SupportTierPoliciesRepository) {}

  /** Every configured tier of one organization, plus nothing for the ones that are not. */
  async list(organizationId: string): Promise<SupportTierPolicy[]> {
    return (await this.policies.list(organizationId)).map(toTierPolicy);
  }

  /**
   * The policy in force for one tier.
   *
   * An unconfigured tier resolves to `neutralTierPolicy`, which is the behaviour that existed
   * before this table did. That is the whole safety property of adding a policy layer to a
   * system already carrying live tickets.
   */
  async forTier(organizationId: string, tier: SupportTier): Promise<SupportTierPolicy> {
    const row = await this.policies.find(organizationId, tier);
    return row ? toTierPolicy(row) : neutralTierPolicy(tier);
  }

  /** Resolution against an already-loaded set, for callers that read the list once. */
  resolve(rows: readonly SupportTierPolicy[], tier: SupportTier): SupportTierPolicy {
    return resolveTierPolicy(rows, tier);
  }

  /** Why this tier may not raise a ticket, or null when it may. */
  raiseRefusal(policy: SupportTierPolicy): string | null {
    if (!policy.admissionEnabled) {
      return `Raising tickets is not part of the ${SUPPORT_TIER_LABELS[policy.tier].toLowerCase()} tier`;
    }
    return null;
  }

  /**
   * Why this tier may not have a call, or null when it may.
   *
   * `requesterInitiated` separates the two questions a call gate actually asks: whether the tier
   * gets calls at all, and whether the person who raised the ticket may start one themselves.
   * Answering them together would tell a client "no calls" when the truth is "not by you".
   */
  callRefusal(policy: SupportTierPolicy, requesterInitiated: boolean): string | null {
    const label = SUPPORT_TIER_LABELS[policy.tier].toLowerCase();
    if (!policy.callsEnabled) {
      return `Support calls are not part of the ${label} tier`;
    }
    if (requesterInitiated && !policy.requesterInitiatedCalls) {
      return `The ${label} tier does not offer calls started by the person who raised the ticket`;
    }
    return null;
  }
}

/** One row into the shared shape `packages/types` reasons about. */
export function toTierPolicy(row: SupportTierPolicyRow): SupportTierPolicy {
  return {
    tier: row.tier as SupportTier,
    admissionEnabled: row.admissionEnabled,
    slaPolicyId: row.slaPolicyId,
    minimumPriority: row.minimumPriority as Priority | null,
    callsEnabled: row.callsEnabled,
    requesterInitiatedCalls: row.requesterInitiatedCalls,
    dedicatedOwnership: row.dedicatedOwnership,
    ackMinutes: row.ackMinutes,
    escalationMinutes: row.escalationMinutes,
    fallbackStrategy: row.fallbackStrategy as SupportFallbackStrategy,
    availabilityWindow: row.availabilityWindow as SupportAvailabilityWindow,
  };
}
