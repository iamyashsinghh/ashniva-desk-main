import type { CallStatus } from '../domain/call';
import type {
  RecordingDenialReason,
  RecordingPlaybackScope,
  RecordingPolicy,
} from '../domain/ivr-policy';
import type { SupportTier } from '../domain/product';
import type { CallRoutingStep } from '../workflow/call-routing';
import type { RoutingRole } from '../workflow/ticket-routing';
import type { UserRef } from './identity';

/**
 * Support calls over the wire.
 *
 * Two shapes exist for a reason and are built by two different mappers. `CallSummary` is what
 * internal staff see; `PortalCallSummary` is what a client sees, and it is an allow-list rather
 * than a redaction — there is no field on it that could carry a staff name, a recording, a
 * routing decision or an internal note, so no future edit can leak one by forgetting to strip it.
 */

/** One attempt to reach somebody. A call that rang three people has three of these. */
export interface CallAttemptSummary {
  id: string;
  sequence: number;
  /** Which rung of the ladder this destination came from. */
  step: CallRoutingStep;
  /** The chain position, when the routing engine named one. */
  role: RoutingRole | null;
  target: UserRef | null;
  status: CallStatus;
  /** Why this destination was chosen, or why the call stopped here. */
  reason: string;
  startedAt: string;
  endedAt: string | null;
}

/** A support call, as internal staff read it. */
export interface CallSummary {
  id: string;
  /** Null for an internal call, which belongs to a conversation rather than to a ticket. */
  ticketId: string | null;
  ticketKey: string | null;
  status: CallStatus;
  /** The provider's own word for how the call ended, unmapped. Null until it ends. */
  providerDisposition: string | null;
  /** Which adapter placed it. Present so a history spanning a provider change stays readable. */
  providerKey: string;
  initiatedBy: UserRef | null;
  /** The member of staff the call actually connected to. Null when nobody answered. */
  connectedTo: UserRef | null;
  /** Who asked for help: a Desk user, or an external reporter's display name. */
  requesterName: string | null;
  requestedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  /**
   * Whether a recording exists — not the recording, and not its reference.
   *
   * Everybody who may read the call history may know that a recording was made; only somebody
   * who passes `canPlayRecording` may reach the thing itself, through its own endpoint.
   */
  hasRecording: boolean;
  recordingReadyAt: string | null;
  /** Whether *this* caller may play it. Computed server-side by the shared decision function. */
  canPlayRecording: boolean;
  /** Why not, when they may not. Null when they may. */
  recordingDenialReason: RecordingDenialReason | null;
  /** Why the call ended without reaching anybody. Null when it connected. */
  queueReason: string | null;
  attempts: CallAttemptSummary[];
}

/**
 * A support call, as the client portal reads it.
 *
 * Deliberately thin. A client may see that they were called, when, and whether it connected —
 * that is their own history and withholding it would be unhelpful. They may not see who inside
 * the provider took it, how the call was routed, what was tried first, or that a recording
 * exists at all.
 */
export interface PortalCallSummary {
  id: string;
  requestedAt: string;
  status: CallStatus;
  durationSeconds: number | null;
}

/** Asking Desk to place a call about a ticket. */
export interface InitiateCallInput {
  /**
   * Whether the caller was told the call may be recorded and agreed.
   *
   * Only consulted when the product's policy is `ON_CONSENT`. `ALWAYS` records regardless because
   * the IVR itself announces it, and `DISABLED` records nothing whatever is sent here.
   */
  recordingConsent?: boolean;
}

/** What Desk decided, returned as soon as the provider has been asked. */
export interface InitiatedCall {
  call: CallSummary;
  /** The rung the first destination came from, so the screen can say who is being rung. */
  step: CallRoutingStep;
}

/** Whether the Call Support action should be offered at all, and why not when it should not. */
export interface CallAvailability {
  enabled: boolean;
  /** A sentence for the disabled control. Null when the action is available. */
  reason: string | null;
}

/** A product's IVR policy, as the administration screen reads it. */
export interface IvrPolicySummary {
  productId: string;
  /** The switch itself. Lives on the product; repeated here so one read answers the question. */
  ivrEnabled: boolean;
  recordingPolicy: RecordingPolicy;
  recordingPlaybackScope: RecordingPlaybackScope;
  /** Support tiers whose tickets may raise a call. Empty means every tier. */
  allowedTiers: SupportTier[];
  /** Whether the person who raised the ticket may ask for a call, or only staff may place one. */
  requesterInitiateEnabled: boolean;
  /** Where a call goes when the routing chain and escalation both come up empty. */
  fallbackUser: UserRef | null;
  maxAttempts: number;
  updatedAt: string | null;
}

/** Editing a product's IVR policy. Every field optional: a partial update leaves the rest alone. */
export interface IvrPolicyInput {
  ivrEnabled?: boolean;
  recordingPolicy?: RecordingPolicy;
  recordingPlaybackScope?: RecordingPlaybackScope;
  allowedTiers?: SupportTier[];
  requesterInitiateEnabled?: boolean;
  fallbackUserId?: string | null;
  maxAttempts?: number;
}

/**
 * A playable recording.
 *
 * A short-lived URL rather than the audio: Desk stores a reference to what the provider holds and
 * does not copy the audio into its own storage. Every issue of one of these is audited.
 */
export interface CallRecordingAccess {
  callId: string;
  url: string;
  expiresAt: string;
}

/**
 * One thing that must arrive before the configured IVR adapter can place a real call.
 *
 * A requirement, not an error. The distinction matters because the commonest reason an IVR is not
 * working is not a fault — it is that somebody has not yet been given the vendor's documentation,
 * and the person looking at the screen needs to know exactly what to ask for rather than that
 * something is "unhealthy".
 */
export interface IvrMissingRequirement {
  /** Stable key, so a screen can order or link these without matching on prose. */
  key: string;
  /** What is missing, in one sentence. */
  what: string;
  /** Exactly what has to be supplied to satisfy it. Each entry is one concrete item. */
  needs: readonly string[];
}

/**
 * Whether the configured adapter can actually place a call, and what is missing when it cannot.
 *
 * This replaces a bare `healthy` boolean because the boolean was unactionable: `false` with the
 * message "the Tata IVR adapter cannot place calls yet" tells an administrator nothing they can
 * do. The list below is the same information the integration document holds, kept next to the
 * switch it governs so the two cannot drift.
 */
export interface IvrReadiness {
  /** Which adapter answered. */
  provider: string;
  /** True only when every requirement is satisfied and a call would really be attempted. */
  healthy: boolean;
  /** What is already in place. Reassurance, and a check that the right adapter is selected. */
  ready: readonly string[];
  /** What is not. Empty when `healthy`. */
  missing: readonly IvrMissingRequirement[];
  /**
   * What happens to a call placed right now.
   *
   * Stated because the failure is deliberately quiet: an unconfigured adapter refuses each
   * destination, Desk walks the whole fallback ladder, and the call ends in the support queue with
   * a person notified. That is the right behaviour and it is easy to mistake for a bug.
   */
  behaviourWhenUnready: string;
}
