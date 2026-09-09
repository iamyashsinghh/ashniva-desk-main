import {
  EMERGENCY_FIX_STATUS,
  INCIDENT_STATUS,
  INCIDENT_STATUS_TRANSITIONS,
  canDecideEmergencyFix,
  canMoveIncident,
  canRequestEmergencyFix,
  isIncidentEnded,
  type EmergencyFixStatus,
  type IncidentStatus,
} from './incident';

/**
 * The incident state machine and the emergency-fix gate.
 *
 * An incident is worked in minutes by whoever is awake, so the transition table is deliberately
 * forgiving in one direction and absolute in the other: going back is ordinary, and CLOSED is the
 * end. Both halves are checked exhaustively here rather than sampled.
 */

const ALL_STATUSES = Object.values(INCIDENT_STATUS);
const ALL_EMERGENCY_STATUSES = Object.values(EMERGENCY_FIX_STATUS);

describe('INCIDENT_STATUS_TRANSITIONS', () => {
  it('names every status, and names only real ones', () => {
    expect(Object.keys(INCIDENT_STATUS_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
    for (const targets of Object.values(INCIDENT_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it('never lets a status move to itself', () => {
    for (const status of ALL_STATUSES) {
      expect(canMoveIncident(status, status)).toBe(false);
    }
  });

  it('makes CLOSED the one terminal state', () => {
    for (const status of ALL_STATUSES) {
      expect(canMoveIncident(INCIDENT_STATUS.CLOSED, status)).toBe(false);
    }
    const terminal = ALL_STATUSES.filter(
      (status: IncidentStatus) => INCIDENT_STATUS_TRANSITIONS[status].length === 0,
    );
    expect(terminal).toEqual([INCIDENT_STATUS.CLOSED]);
  });

  it('lets any live incident be resolved from where it is', () => {
    // Somebody who has just stopped the bleeding should not have to walk the incident through
    // three screens to say so.
    for (const status of [
      INCIDENT_STATUS.OPEN,
      INCIDENT_STATUS.INVESTIGATING,
      INCIDENT_STATUS.IDENTIFIED,
      INCIDENT_STATUS.MONITORING,
    ]) {
      expect(canMoveIncident(status, INCIDENT_STATUS.RESOLVED)).toBe(true);
    }
  });

  it('allows the step backwards when a cause turns out to be wrong', () => {
    expect(canMoveIncident(INCIDENT_STATUS.IDENTIFIED, INCIDENT_STATUS.INVESTIGATING)).toBe(true);
    expect(canMoveIncident(INCIDENT_STATUS.MONITORING, INCIDENT_STATUS.INVESTIGATING)).toBe(true);
    expect(canMoveIncident(INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.INVESTIGATING)).toBe(true);
  });

  it('reaches CLOSED only from RESOLVED, so nothing is closed while it still hurts', () => {
    const closable = ALL_STATUSES.filter((status: IncidentStatus) =>
      canMoveIncident(status, INCIDENT_STATUS.CLOSED),
    );
    expect(closable).toEqual([INCIDENT_STATUS.RESOLVED]);
  });

  it('does not let an open incident skip straight past investigation to a cause', () => {
    expect(canMoveIncident(INCIDENT_STATUS.OPEN, INCIDENT_STATUS.IDENTIFIED)).toBe(false);
    expect(canMoveIncident(INCIDENT_STATUS.OPEN, INCIDENT_STATUS.CLOSED)).toBe(false);
  });

  it('counts only resolved and closed as ended', () => {
    const ended = ALL_STATUSES.filter(isIncidentEnded);
    expect(ended.sort()).toEqual([INCIDENT_STATUS.CLOSED, INCIDENT_STATUS.RESOLVED].sort());
  });
});

describe('the emergency-fix gate', () => {
  it('allows a request exactly once', () => {
    const requestable = ALL_EMERGENCY_STATUSES.filter((status: EmergencyFixStatus) =>
      canRequestEmergencyFix(status),
    );
    // A rejection is a decision. Re-requesting until somebody says yes is what a gate exists to
    // prevent; a genuinely changed situation is a new incident.
    expect(requestable).toEqual([EMERGENCY_FIX_STATUS.NONE]);
  });

  it('allows a decision only on a request that is waiting', () => {
    const decidable = ALL_EMERGENCY_STATUSES.filter((status: EmergencyFixStatus) =>
      canDecideEmergencyFix(status),
    );
    expect(decidable).toEqual([EMERGENCY_FIX_STATUS.REQUESTED]);
  });

  it('does not let an approval be taken back by a second decision', () => {
    expect(canDecideEmergencyFix(EMERGENCY_FIX_STATUS.APPROVED)).toBe(false);
    expect(canDecideEmergencyFix(EMERGENCY_FIX_STATUS.REJECTED)).toBe(false);
  });
});
