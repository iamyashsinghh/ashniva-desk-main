/**
 * Incidents — the urgent end of the problem-management chain.
 *
 * A *problem* is "the same fault keeps being reported"; an *incident* is "something is broken right
 * now". They are separate records because they are answered by different people on different
 * clocks: an incident is worked in minutes, a problem is investigated over days and closed by an
 * RCA. An incident may raise a problem and a problem may cause an incident, so they link — but
 * neither is a status of the other.
 *
 * Severity is `Priority`, not a scale of its own. The approved design shows a Critical/High pill on
 * both problems and incidents, and a second four-level vocabulary would mean every filter, badge
 * and sort in the product had to know which of the two it was looking at.
 */

/**
 * The incident lifecycle.
 *
 * `MONITORING` is what stops an incident being closed the moment a fix ships — the fix is out and
 * nobody is sure yet. `RESOLVED` says the impact ended; `CLOSED` says the follow-up is done.
 * Collapsing those two would mean either closing incidents that still owe an RCA, or leaving every
 * incident open until the paperwork catches up.
 */
export const INCIDENT_STATUS = {
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  IDENTIFIED: 'IDENTIFIED',
  MONITORING: 'MONITORING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;

export type IncidentStatus = (typeof INCIDENT_STATUS)[keyof typeof INCIDENT_STATUS];

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  OPEN: 'Open',
  INVESTIGATING: 'Investigating',
  IDENTIFIED: 'Cause identified',
  MONITORING: 'Monitoring the fix',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/**
 * Where each status may go next.
 *
 * Backwards steps are deliberate: an incident that looked identified and then was not is an
 * ordinary event, and a machine that refuses to go back only teaches people to close and reopen.
 * `CLOSED` is the single terminal state — reopening is a new incident, so the first one's timeline
 * keeps meaning what it said.
 */
export const INCIDENT_STATUS_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  OPEN: [INCIDENT_STATUS.INVESTIGATING, INCIDENT_STATUS.RESOLVED],
  INVESTIGATING: [INCIDENT_STATUS.IDENTIFIED, INCIDENT_STATUS.MONITORING, INCIDENT_STATUS.RESOLVED],
  IDENTIFIED: [INCIDENT_STATUS.MONITORING, INCIDENT_STATUS.INVESTIGATING, INCIDENT_STATUS.RESOLVED],
  MONITORING: [INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.INVESTIGATING],
  RESOLVED: [INCIDENT_STATUS.CLOSED, INCIDENT_STATUS.INVESTIGATING],
  CLOSED: [],
};

export function canMoveIncident(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_STATUS_TRANSITIONS[from].includes(to);
}

/** Statuses that mean the impact is over — used to stop the clock and to filter "open" lists. */
export const ENDED_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  INCIDENT_STATUS.RESOLVED,
  INCIDENT_STATUS.CLOSED,
];

export function isIncidentEnded(status: IncidentStatus): boolean {
  return ENDED_INCIDENT_STATUSES.includes(status);
}

/**
 * What an entry in the incident timeline records.
 *
 * The timeline is append-only and is the incident's own account of itself. `NOTE` is the free text
 * a responder writes; every other kind is written by the service when the thing it names actually
 * happens, so a timeline cannot claim a state change the incident never made.
 */
export const INCIDENT_TIMELINE_KIND = {
  OPENED: 'OPENED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  SEVERITY_CHANGED: 'SEVERITY_CHANGED',
  OWNER_CHANGED: 'OWNER_CHANGED',
  NOTE: 'NOTE',
  LINK_ADDED: 'LINK_ADDED',
  EMERGENCY_FIX_REQUESTED: 'EMERGENCY_FIX_REQUESTED',
  EMERGENCY_FIX_APPROVED: 'EMERGENCY_FIX_APPROVED',
  EMERGENCY_FIX_REJECTED: 'EMERGENCY_FIX_REJECTED',
  CLIENT_SUMMARY_PUBLISHED: 'CLIENT_SUMMARY_PUBLISHED',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;

export type IncidentTimelineKind =
  (typeof INCIDENT_TIMELINE_KIND)[keyof typeof INCIDENT_TIMELINE_KIND];

/**
 * What an incident can be linked to. One row per link, so an incident carries as many as it needs
 * and each one records who added it and when.
 */
export const INCIDENT_LINK_KIND = {
  TICKET: 'TICKET',
  TASK: 'TASK',
  RELEASE: 'RELEASE',
} as const;

export type IncidentLinkKind = (typeof INCIDENT_LINK_KIND)[keyof typeof INCIDENT_LINK_KIND];

export const INCIDENT_LINK_KIND_LABELS: Record<IncidentLinkKind, string> = {
  TICKET: 'Ticket',
  TASK: 'Task',
  RELEASE: 'Release',
};

/**
 * The emergency-fix gate.
 *
 * Shipping outside the release process is allowed, but only after somebody senior says so in
 * writing. `REQUESTED` is not permission to deploy; `APPROVED` is, and it names who gave it and
 * why. The approved mobile flow states the consequence on the approval sheet itself — "skips the
 * scheduled release; still requires a QA smoke on production afterwards" — so the reason field is
 * required rather than optional.
 */
export const EMERGENCY_FIX_STATUS = {
  NONE: 'NONE',
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type EmergencyFixStatus = (typeof EMERGENCY_FIX_STATUS)[keyof typeof EMERGENCY_FIX_STATUS];

export const EMERGENCY_FIX_STATUS_LABELS: Record<EmergencyFixStatus, string> = {
  NONE: 'Not requested',
  REQUESTED: 'Waiting for approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/**
 * Whether an emergency fix may be requested at all.
 *
 * Only once per incident: a rejected request is a decision, and re-requesting it until somebody
 * says yes is exactly what an approval gate exists to prevent. A genuinely changed situation is a
 * new incident, which is also how the timeline stays readable.
 */
export function canRequestEmergencyFix(status: EmergencyFixStatus): boolean {
  return status === EMERGENCY_FIX_STATUS.NONE;
}

export function canDecideEmergencyFix(status: EmergencyFixStatus): boolean {
  return status === EMERGENCY_FIX_STATUS.REQUESTED;
}
