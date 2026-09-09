import {
  EMERGENCY_FIX_STATUS,
  INCIDENT_STATUS,
  PROBLEM_STATUS,
  type EmergencyFixStatus,
  type IncidentStatus,
  type ProblemClosureState,
  type ProblemStatus,
  type RcaReport,
  type SimilarityDecision,
} from '@ashniva/types';
import type { Tone } from '@ashniva/ui';

/**
 * Wording and tones for the problem and incident screens.
 *
 * The enums themselves live in `@ashniva/types`; these are the sentences a reader sees. Every map
 * is keyed by its type, so a new member of an enum fails the type-check here rather than rendering
 * as a raw constant on a screen somebody is reading at two in the morning.
 */

export function problemTone(status: ProblemStatus): Tone {
  if (status === PROBLEM_STATUS.CLOSED) {
    return 'success';
  }
  return status === PROBLEM_STATUS.OPEN ? 'danger' : 'progress';
}

export function incidentTone(status: IncidentStatus): Tone {
  if (status === INCIDENT_STATUS.RESOLVED || status === INCIDENT_STATUS.CLOSED) {
    return 'success';
  }
  return status === INCIDENT_STATUS.OPEN ? 'danger' : 'progress';
}

export const EMERGENCY_FIX_TONE: Record<EmergencyFixStatus, Tone> = {
  NONE: 'neutral',
  REQUESTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export const SIMILARITY_DECISION_TONE: Record<SimilarityDecision, Tone> = {
  PENDING: 'warning',
  LINKED: 'success',
  DISMISSED: 'neutral',
};

export const RCA_STATUS_LABELS: Record<RcaReport['status'], string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted for review',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
};

export const RCA_STATUS_TONE: Record<RcaReport['status'], Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'progress',
  APPROVED: 'success',
  CHANGES_REQUESTED: 'danger',
};

/**
 * Why Close is off, in the server's own words.
 *
 * `closure.allowed` is the only thing that decides whether the button works, and the server's own
 * blocker sentences are the only explanation offered. Nothing here re-checks the analysis or the
 * fix: that arithmetic is done once, on the server, and copied — not repeated. Returns undefined
 * when the problem may be closed, which is what "the button is enabled" means.
 */
export function closeBlockedReason(closure: ProblemClosureState): string | undefined {
  return closure.allowed ? undefined : closure.blockers.join(' ');
}

/**
 * The warning the approved ticket screen shows above the suggestions.
 *
 * The version comes from the suggestions themselves rather than from the ticket, because the
 * sentence is about the *other* clients: "3 clients on 3.1.4" means three companies reported this
 * on that build. When they disagree about the version it says so rather than picking one.
 */
export function similarWarning(input: {
  clientCount: number;
  versions: Array<string | null>;
}): string {
  const versions = [
    ...new Set(input.versions.filter((version): version is string => Boolean(version))),
  ];
  const clients = `${input.clientCount} ${input.clientCount === 1 ? 'client' : 'clients'}`;
  if (versions.length === 1) {
    return `Similar issues · ${clients} on ${versions[0]}`;
  }
  if (versions.length > 1) {
    return `Similar issues · ${clients} across ${versions.length} versions`;
  }
  return `Similar issues · ${clients}`;
}

/** The line the approved design prints under that warning, unchanged. */
export const CLIENT_IDENTITY_NOTE = 'Client identities are never shown to other clients.';

/** How long an incident lasted, in the words a review uses. */
export function durationLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** The banner on a problem: how many separate clients, on which builds. */
export function reportedByLabel(clientCount: number, versions: string[]): string {
  const clients = `${clientCount} ${clientCount === 1 ? 'client' : 'clients'}`;
  if (versions.length === 0) {
    return `Reported by ${clients}`;
  }
  if (versions.length === 1) {
    return `Reported by ${clients} using version ${versions[0]}`;
  }
  return `Reported by ${clients} using versions ${versions.join(', ')}`;
}

export const PROBLEM_ACTION_STATUS_ORDER: readonly ProblemStatus[] = [
  PROBLEM_STATUS.OPEN,
  PROBLEM_STATUS.RCA_REQUESTED,
  PROBLEM_STATUS.RCA_SUBMITTED,
  PROBLEM_STATUS.FIX_ASSIGNED,
  PROBLEM_STATUS.FIX_RELEASED,
  PROBLEM_STATUS.CLOSED,
];

export function isEmergencyFixDecided(status: EmergencyFixStatus): boolean {
  return status === EMERGENCY_FIX_STATUS.APPROVED || status === EMERGENCY_FIX_STATUS.REJECTED;
}
