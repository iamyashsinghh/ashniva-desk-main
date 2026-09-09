/**
 * What a product allows its support calls to do.
 *
 * The switch itself is `Product.ivrEnabled`, which has existed since package 8c. This file is
 * everything the switch does not say: which support tiers may call at all, whether the person who
 * raised the ticket may ask for a call or only staff may place one, whether calls are recorded,
 * and — the part that matters most — who may later listen to a recording.
 *
 * Recording playback is treated as its own decision, separately from reading a ticket, because a
 * recording is a client's voice. Somebody allowed to read a support ticket has not thereby been
 * allowed to listen to the reporter describing their problem, and nothing in this file lets the
 * two collapse into one check.
 */

/** Whether the provider is asked to record, and on what basis. */
export const RECORDING_POLICY = {
  /** Never recorded. No recording reference is ever stored for this product. */
  DISABLED: 'DISABLED',
  /** Recorded only when the caller was told and agreed. The consent is stored with the call. */
  ON_CONSENT: 'ON_CONSENT',
  /** Always recorded. Appropriate only where the IVR itself announces it. */
  ALWAYS: 'ALWAYS',
} as const;

export type RecordingPolicy = (typeof RECORDING_POLICY)[keyof typeof RECORDING_POLICY];

export const RECORDING_POLICY_LABELS: Record<RecordingPolicy, string> = {
  DISABLED: 'Never record',
  ON_CONSENT: 'Record with consent',
  ALWAYS: 'Always record',
};

/**
 * How far playback reaches, on top of the permission.
 *
 * Each widens the one before it, and the default is the narrowest that is still useful. Note what
 * none of them contains: a client, a requester, or anybody who is not on the ticket's project.
 * Those are not scopes that can be selected — they are excluded by `canPlayRecording` before the
 * scope is consulted at all.
 */
export const RECORDING_PLAYBACK_SCOPE = {
  /** The project's manager and lead, and whoever administers the IVR policy. The default. */
  LEADS_ONLY: 'LEADS_ONLY',
  /** The above, plus the one member of staff who was actually connected on the call. */
  CONNECTED_STAFF: 'CONNECTED_STAFF',
  /** The above, plus any member of the ticket's project holding the playback permission. */
  PROJECT_STAFF: 'PROJECT_STAFF',
} as const;

export type RecordingPlaybackScope =
  (typeof RECORDING_PLAYBACK_SCOPE)[keyof typeof RECORDING_PLAYBACK_SCOPE];

export const RECORDING_PLAYBACK_SCOPE_LABELS: Record<RecordingPlaybackScope, string> = {
  LEADS_ONLY: 'Project manager and team lead only',
  CONNECTED_STAFF: 'Leads, and whoever took the call',
  PROJECT_STAFF: 'Anyone on the project with the playback permission',
};

/** Why playback was refused. The API returns the code; the screen turns it into a sentence. */
export const RECORDING_DENIAL_REASON = {
  /** The caller is a client or an external reporter. There is no scope that admits them. */
  NOT_INTERNAL: 'NOT_INTERNAL',
  /** No `call:play-recording`. Reading the ticket was never enough. */
  NO_PERMISSION: 'NO_PERMISSION',
  /** Internal, permitted, but not on this ticket's project. */
  NOT_ON_PROJECT: 'NOT_ON_PROJECT',
  /** On the project, but the product's scope does not reach their part in it. */
  OUTSIDE_SCOPE: 'OUTSIDE_SCOPE',
  /** The product does not record, or this call was not recorded. */
  NO_RECORDING: 'NO_RECORDING',
} as const;

export type RecordingDenialReason =
  (typeof RECORDING_DENIAL_REASON)[keyof typeof RECORDING_DENIAL_REASON];

export const RECORDING_DENIAL_REASON_LABELS: Record<RecordingDenialReason, string> = {
  NOT_INTERNAL: 'Call recordings are internal to the support team',
  NO_PERMISSION: 'You do not have permission to play call recordings',
  NOT_ON_PROJECT: 'You are not on this project',
  OUTSIDE_SCOPE: "This product's recording policy does not include your role on the project",
  NO_RECORDING: 'There is no recording for this call',
};

/** Everything the decision needs, resolved by the caller before it is asked. */
export interface RecordingAccessInput {
  /** False for every client user and every external reporter, whatever else is true. */
  isInternal: boolean;
  /** Whether the caller holds `call:play-recording`. */
  hasPlaybackPermission: boolean;
  /** Whether the caller holds `ivr:manage` — the permission that sets this very policy. */
  administersIvr: boolean;
  /** The caller's role on the ticket's project, or null when they are not a member. */
  projectRole: 'MANAGER' | 'LEAD' | 'DEVELOPER' | 'TESTER' | 'SUPPORT' | 'CLIENT_CONTACT' | null;
  /** Whether the caller is the member of staff the call actually connected to. */
  isConnectedStaff: boolean;
  scope: RecordingPlaybackScope;
  /** False when the call has no recording — nothing to play, whoever is asking. */
  hasRecording: boolean;
}

export interface RecordingAccessDecision {
  allowed: boolean;
  reason: RecordingDenialReason | null;
}

const LEAD_ROLES = new Set(['MANAGER', 'LEAD']);

/**
 * May this person play this recording?
 *
 * Pure, and shared by the API and the web app on purpose: the button and the endpoint have to
 * agree, and the only way to guarantee that is for them to run the same function. The API calls
 * it as the *decision*; the web app calls it to decide whether to draw a control. Hiding the
 * control is never the protection — the endpoint runs this too, and refuses.
 *
 * The order of the checks is the order of the reasons somebody deserves back. Being a client is
 * reported as being a client, not as lacking a permission they could ask for and never get.
 */
export function canPlayRecording(input: RecordingAccessInput): RecordingAccessDecision {
  if (!input.isInternal) {
    return { allowed: false, reason: RECORDING_DENIAL_REASON.NOT_INTERNAL };
  }
  if (!input.hasRecording) {
    return { allowed: false, reason: RECORDING_DENIAL_REASON.NO_RECORDING };
  }
  if (!input.hasPlaybackPermission) {
    return { allowed: false, reason: RECORDING_DENIAL_REASON.NO_PERMISSION };
  }
  // Whoever sets a product's recording policy can hear what it produced. Withholding that from
  // the one role accountable for the policy would make the policy unauditable.
  if (input.administersIvr) {
    return { allowed: true, reason: null };
  }
  if (input.projectRole === null) {
    return { allowed: false, reason: RECORDING_DENIAL_REASON.NOT_ON_PROJECT };
  }
  if (LEAD_ROLES.has(input.projectRole)) {
    return { allowed: true, reason: null };
  }
  if (input.scope === RECORDING_PLAYBACK_SCOPE.PROJECT_STAFF) {
    return { allowed: true, reason: null };
  }
  if (input.scope === RECORDING_PLAYBACK_SCOPE.CONNECTED_STAFF && input.isConnectedStaff) {
    return { allowed: true, reason: null };
  }
  return { allowed: false, reason: RECORDING_DENIAL_REASON.OUTSIDE_SCOPE };
}

/** Whether a call placed under this policy should be recorded, given what the caller agreed to. */
export function shouldRecord(policy: RecordingPolicy, consentGiven: boolean): boolean {
  if (policy === RECORDING_POLICY.DISABLED) {
    return false;
  }
  return policy === RECORDING_POLICY.ALWAYS || consentGiven;
}

/** The most destinations one call may try before it stops and asks a person for help. */
export const DEFAULT_MAX_CALL_ATTEMPTS = 3;
/** The ceiling an administrator may configure. A call that rings ten people has already failed. */
export const MAX_CALL_ATTEMPTS_LIMIT = 5;
