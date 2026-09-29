import {
  INCIDENT_STATUS,
  PRIORITY,
  PROBLEM_STATUS,
  RCA_IN_PROGRESS_STATUSES,
  type EmergencyFixStatus,
  type IncidentStatus,
  type Priority,
  type ProblemClosureState,
  type ProblemStatus,
  type RcaReport,
} from '@ashniva/types';

import type { IconTone } from '../../shared/components/Icon';
import type { PillTone } from '../../shared/components/primitives';

/**
 * Wording and tones for the problem and incident screens — the web's `problem-display.ts`, in the
 * phone's pill tones. The enums live in `@ashniva/types`; every map here is keyed by its type, so
 * a new member fails the type-check rather than rendering as a raw constant.
 */

export function problemTone(status: ProblemStatus): PillTone {
  if (status === PROBLEM_STATUS.CLOSED) {
    return 'success';
  }
  return status === PROBLEM_STATUS.OPEN ? 'danger' : 'progress';
}

export function incidentTone(status: IncidentStatus): PillTone {
  if (status === INCIDENT_STATUS.RESOLVED || status === INCIDENT_STATUS.CLOSED) {
    return 'success';
  }
  return status === INCIDENT_STATUS.OPEN ? 'danger' : 'progress';
}

export const SEVERITY_TONE: Record<Priority, PillTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

export const SEVERITY_ICON_TONE: Record<Priority, IconTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

export const SEVERITIES: readonly Priority[] = [
  PRIORITY.CRITICAL,
  PRIORITY.HIGH,
  PRIORITY.MEDIUM,
  PRIORITY.LOW,
];

export const EMERGENCY_FIX_TONE: Record<EmergencyFixStatus, PillTone> = {
  NONE: 'neutral',
  REQUESTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export const RCA_STATUS_LABELS: Record<RcaReport['status'], string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted for review',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
};

export const RCA_STATUS_TONE: Record<RcaReport['status'], PillTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'progress',
  APPROVED: 'success',
  CHANGES_REQUESTED: 'danger',
};

/**
 * Why Close is off, in the server's own words. `closure.allowed` alone decides whether the button
 * works; nothing here re-checks the analysis or the fix. Undefined when the problem may be closed.
 */
export function closeBlockedReason(closure: ProblemClosureState): string | undefined {
  return closure.allowed ? undefined : closure.blockers.join(' ');
}

/** The banner on a problem: how many separate clients, on which builds. */
export function reportedByLabel(clientCount: number, versions: readonly string[]): string {
  const clients = `${clientCount} ${clientCount === 1 ? 'client' : 'clients'}`;
  if (versions.length === 0) {
    return `Reported by ${clients}`;
  }
  if (versions.length === 1) {
    return `Reported by ${clients} using version ${versions[0]}`;
  }
  return `Reported by ${clients} using versions ${versions.join(', ')}`;
}

/** The problem list's views, grouped by what somebody has to do next rather than by date. */
export type ProblemView = 'open' | 'rca' | 'fixing' | 'closed' | 'all';

export const PROBLEM_VIEWS: Record<ProblemView, { label: string; statuses?: ProblemStatus[] }> = {
  open: { label: 'Open', statuses: [PROBLEM_STATUS.OPEN] },
  rca: { label: 'RCA in progress', statuses: [...RCA_IN_PROGRESS_STATUSES] },
  fixing: {
    label: 'Fix in flight',
    statuses: [PROBLEM_STATUS.FIX_ASSIGNED, PROBLEM_STATUS.FIX_RELEASED],
  },
  closed: { label: 'Closed', statuses: [PROBLEM_STATUS.CLOSED] },
  all: { label: 'All' },
};

export type IncidentView = 'live' | 'resolved' | 'all';

export const INCIDENT_VIEWS: Record<IncidentView, { label: string; statuses?: IncidentStatus[] }> =
  {
    live: {
      label: 'Live',
      statuses: [
        INCIDENT_STATUS.OPEN,
        INCIDENT_STATUS.INVESTIGATING,
        INCIDENT_STATUS.IDENTIFIED,
        INCIDENT_STATUS.MONITORING,
      ],
    },
    resolved: { label: 'Resolved', statuses: [INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.CLOSED] },
    all: { label: 'All' },
  };

/** The line every problem and incident screen carries, so nobody mistakes it for a client view. */
export const PROBLEM_INTERNAL_NOTE = 'Internal — no client ever sees a problem.';
export const INCIDENT_INTERNAL_NOTE = 'Internal — clients see only a summary somebody publishes.';
