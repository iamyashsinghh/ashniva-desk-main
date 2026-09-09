import { SUPPORT_TIER } from './product';
import {
  SUPPORT_AVAILABILITY_WINDOW,
  SUPPORT_FALLBACK_STRATEGY,
  neutralTierPolicy,
  resolveTierPolicy,
  tierTiming,
  type SupportTierPolicy,
} from './support-tier-policy';

const priority: SupportTierPolicy = {
  ...neutralTierPolicy(SUPPORT_TIER.PRIORITY),
  slaPolicyId: 'sla-priority',
  ackMinutes: 5,
  escalationMinutes: 10,
  minimumPriority: 'HIGH',
};

describe('resolving a tier policy', () => {
  it('returns the configured row for a tier that has one', () => {
    expect(resolveTierPolicy([priority], SUPPORT_TIER.PRIORITY)).toBe(priority);
  });

  /**
   * The property everything else rests on: adding this table to a system already carrying live
   * tickets must change nothing until somebody configures something. "Empty means every tier" in
   * `ProductIvrPolicy.allowedTiers` is the same idea — absence is never a restriction.
   */
  it('falls back to the neutral policy for a tier with no row, and for an empty set', () => {
    expect(resolveTierPolicy([priority], SUPPORT_TIER.BASIC)).toEqual(
      neutralTierPolicy(SUPPORT_TIER.BASIC),
    );
    expect(resolveTierPolicy([], SUPPORT_TIER.ENTERPRISE)).toEqual(
      neutralTierPolicy(SUPPORT_TIER.ENTERPRISE),
    );
  });

  it('leaves every behaviour open in the neutral policy', () => {
    const neutral = neutralTierPolicy(SUPPORT_TIER.STANDARD);
    expect(neutral).toEqual({
      tier: SUPPORT_TIER.STANDARD,
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
    });
  });
});

describe('tier timings', () => {
  it('uses the tier’s minutes where it sets them', () => {
    expect(tierTiming(priority, 15, 30)).toEqual({ ackMinutes: 5, escalationMinutes: 10 });
  });

  it('keeps the project’s own minutes where the tier sets none', () => {
    expect(tierTiming(neutralTierPolicy(SUPPORT_TIER.BASIC), 15, 30)).toEqual({
      ackMinutes: 15,
      escalationMinutes: 30,
    });
  });

  it('takes each minute independently, so setting one does not blank the other', () => {
    const halfConfigured = { ...neutralTierPolicy(SUPPORT_TIER.STANDARD), ackMinutes: 5 };
    expect(tierTiming(halfConfigured, 15, 30)).toEqual({ ackMinutes: 5, escalationMinutes: 30 });
  });
});
