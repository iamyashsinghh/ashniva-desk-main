import type { Priority } from '../domain/priority';
import type { SupportTier } from '../domain/product';
import type {
  SupportAvailabilityWindow,
  SupportFallbackStrategy,
} from '../domain/support-tier-policy';

/** One tier's configured behaviour, as the administration screens read and write it. */
export interface SupportTierPolicySummary {
  tier: SupportTier;
  admissionEnabled: boolean;
  slaPolicy: { id: string; name: string } | null;
  minimumPriority: Priority | null;
  callsEnabled: boolean;
  requesterInitiatedCalls: boolean;
  dedicatedOwnership: boolean;
  ackMinutes: number | null;
  escalationMinutes: number | null;
  fallbackStrategy: SupportFallbackStrategy;
  availabilityWindow: SupportAvailabilityWindow;
  /** False when no row exists — the tier is running on the neutral defaults. */
  configured: boolean;
  updatedAt: string | null;
}

/**
 * What a tier currently permits one product to do, in words.
 *
 * A sentence rather than a thrown error, copying `calls.service.refusalFor`: the same answer has
 * to drive both the API's refusal and a disabled control on a screen, and a disabled control that
 * cannot say why is only slightly better than one that lies.
 */
export interface SupportTierEntitlements {
  tier: SupportTier;
  canRaiseTicket: boolean;
  raiseRefusal: string | null;
  canRequestCall: boolean;
  callRefusal: string | null;
}
