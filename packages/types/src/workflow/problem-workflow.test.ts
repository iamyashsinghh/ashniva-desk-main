import { PROBLEM_STATUS, type ProblemStatus } from './problem-status';
import {
  DEFAULT_DUPLICATE_THRESHOLD,
  PROBLEM_STATUS_TRANSITIONS,
  canMoveProblem,
  crossesDuplicateThreshold,
  isProblemOpen,
  problemClosureGate,
  type ProblemClosureFacts,
} from './problem-workflow';

/**
 * The two answers a screen asks for before anything is clicked — may this move, and may this
 * close — plus the counting rule that decides whether a problem should exist at all.
 */

const ALL_STATUSES = Object.values(PROBLEM_STATUS);

/** Everything satisfied, so each test can spoil exactly one fact and see only that blocker. */
const READY: ProblemClosureFacts = {
  rcaSubmitted: true,
  fixAssigned: true,
  fixVerified: true,
  preventiveTestAdded: true,
};

describe('PROBLEM_STATUS_TRANSITIONS', () => {
  it('names every status, and names only real ones', () => {
    expect(Object.keys(PROBLEM_STATUS_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
    for (const targets of Object.values(PROBLEM_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it('never lets a status move to itself', () => {
    for (const status of ALL_STATUSES) {
      expect(canMoveProblem(status, status)).toBe(false);
    }
  });

  it('makes CLOSED terminal: reopening is a new problem', () => {
    for (const status of ALL_STATUSES) {
      expect(canMoveProblem(PROBLEM_STATUS.CLOSED, status)).toBe(false);
    }
    expect(isProblemOpen(PROBLEM_STATUS.CLOSED)).toBe(false);
  });

  it('lets the fix start before the write-up lands', () => {
    // The cause is often obvious long before the RCA is finished, and blocking the fix on the
    // paperwork would be the wrong way round. `problemClosureGate` is what still owes the RCA.
    expect(canMoveProblem(PROBLEM_STATUS.RCA_REQUESTED, PROBLEM_STATUS.FIX_ASSIGNED)).toBe(true);
    expect(canMoveProblem(PROBLEM_STATUS.RCA_REQUESTED, PROBLEM_STATUS.CLOSED)).toBe(false);
  });

  it('reaches CLOSED only from open, RCA submitted or fix released', () => {
    const closable = ALL_STATUSES.filter((status: ProblemStatus) =>
      canMoveProblem(status, PROBLEM_STATUS.CLOSED),
    );
    expect(closable.sort()).toEqual(
      [PROBLEM_STATUS.OPEN, PROBLEM_STATUS.RCA_SUBMITTED, PROBLEM_STATUS.FIX_RELEASED].sort(),
    );
  });
});

describe('problemClosureGate', () => {
  it('allows a close when everything is done, with nothing to say', () => {
    expect(problemClosureGate(READY)).toEqual({ allowed: true, blockers: [], warnings: [] });
  });

  it('blocks on a missing root-cause analysis, on its own', () => {
    const decision = problemClosureGate({ ...READY, rcaSubmitted: false });
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toEqual(['The root-cause analysis has not been submitted yet.']);
  });

  it('blocks on a missing permanent fix, on its own', () => {
    const decision = problemClosureGate({ ...READY, fixAssigned: false, fixVerified: false });
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toEqual(['No permanent fix has been assigned.']);
  });

  it('blocks on a fix that has not been verified live, on its own', () => {
    const decision = problemClosureGate({ ...READY, fixVerified: false });
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toEqual(['The permanent fix has not been verified live.']);
  });

  it('does not ask twice about a fix that was never assigned', () => {
    // "Not assigned" and "not verified" are the same gap seen twice; saying both would read as
    // two separate pieces of work.
    const decision = problemClosureGate({ ...READY, fixAssigned: false, fixVerified: false });
    expect(decision.blockers).toHaveLength(1);
  });

  it('reports a missing preventive test without blocking on it', () => {
    const decision = problemClosureGate({ ...READY, preventiveTestAdded: false });
    expect(decision.allowed).toBe(true);
    expect(decision.warnings).toEqual(['No preventive test has been added.']);
  });

  it('lists every outstanding blocker at once when nothing has been done', () => {
    const decision = problemClosureGate({
      rcaSubmitted: false,
      fixAssigned: false,
      fixVerified: false,
      preventiveTestAdded: false,
    });
    expect(decision.blockers).toEqual([
      'The root-cause analysis has not been submitted yet.',
      'No permanent fix has been assigned.',
    ]);
  });
});

describe('crossesDuplicateThreshold', () => {
  it('does not trip on three reports from one client', () => {
    // The property this rule exists for. Three tickets, one unhappy client — not a fault in the
    // product, and not something to open a problem about behind a support executive's back.
    expect(crossesDuplicateThreshold(['acme', 'acme', 'acme'], 3)).toBe(false);
  });

  it('trips on three reports from three clients', () => {
    expect(crossesDuplicateThreshold(['acme', 'zenith', 'orbit'], 3)).toBe(true);
  });

  it('trips once the count is past the threshold as well as level with it', () => {
    expect(crossesDuplicateThreshold(['a', 'b', 'c', 'd'], 3)).toBe(true);
  });

  it('counts duplicates in a mixed group as one client each', () => {
    expect(crossesDuplicateThreshold(['acme', 'acme', 'zenith', 'zenith'], 3)).toBe(false);
  });

  it('treats a threshold of zero or less as switched off, not as always true', () => {
    expect(crossesDuplicateThreshold(['acme'], 0)).toBe(false);
    expect(crossesDuplicateThreshold([], -1)).toBe(false);
  });

  it('ships a default the settings screen can show', () => {
    expect(DEFAULT_DUPLICATE_THRESHOLD).toBe(3);
  });
});
