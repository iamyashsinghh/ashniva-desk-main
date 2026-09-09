import {
  PERMISSIONS,
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type PermissionKey,
  type TestingAssignmentKind,
  type TestingAssignmentStatus,
} from '@ashniva/types';

import {
  OPEN_TESTING_ASSIGNMENT_STATUSES,
  TESTING_ASSIGNMENT_ACTIONS,
  TESTING_ASSIGNMENT_TRANSITIONS,
  canTransitionTestingAssignment,
  checkTestingAssignmentAction,
  needsRetest,
  type TestingAssignmentAction,
} from './testing-assignment-workflow';

const S = TESTING_ASSIGNMENT_STATUS;
const K = TESTING_ASSIGNMENT_KIND;

const TESTER: PermissionKey[] = [PERMISSIONS.QA_RECORD_RESULT];
const VERIFIER: PermissionKey[] = [PERMISSIONS.QA_VERIFY_LIVE];
const LEAD: PermissionKey[] = [PERMISSIONS.QA_ASSIGN];
const EVERYTHING: PermissionKey[] = [...TESTER, ...VERIFIER, ...LEAD];

const ME = 'user-tester';
const SOMEONE_ELSE = 'user-other';

const me = (permissions: readonly PermissionKey[] = TESTER) => ({ userId: ME, permissions });
const mine = (kind: TestingAssignmentKind = K.QA) => ({ kind, assignedToUserId: ME });
const theirs = (kind: TestingAssignmentKind = K.QA) => ({ kind, assignedToUserId: SOMEONE_ELSE });
const unassigned = (kind: TestingAssignmentKind = K.QA) => ({ kind, assignedToUserId: null });

const ALL_STATUSES = Object.values(S);

describe('checkTestingAssignmentAction — the happy path', () => {
  it('starts a pending assignment', () => {
    expect(checkTestingAssignmentAction('start', S.PENDING, mine(), me())).toEqual({
      ok: true,
      to: S.IN_PROGRESS,
    });
  });

  it('passes work that is in progress', () => {
    expect(checkTestingAssignmentAction('pass', S.IN_PROGRESS, mine(), me())).toEqual({
      ok: true,
      to: S.PASSED,
    });
  });

  it('fails work that is in progress', () => {
    expect(checkTestingAssignmentAction('fail', S.IN_PROGRESS, mine(), me())).toEqual({
      ok: true,
      to: S.FAILED,
    });
  });

  it('sends work back with a question', () => {
    expect(
      checkTestingAssignmentAction('clarify', S.IN_PROGRESS, mine(), me(), 'Which tenant?'),
    ).toEqual({ ok: true, to: S.CLARIFICATION });
  });

  it('picks the work back up once the question is answered', () => {
    expect(checkTestingAssignmentAction('start', S.CLARIFICATION, mine(), me())).toEqual({
      ok: true,
      to: S.IN_PROGRESS,
    });
  });

  it('verifies a live verification', () => {
    expect(
      checkTestingAssignmentAction(
        'verifyLive',
        S.IN_PROGRESS,
        theirs(K.LIVE_VERIFICATION),
        me(VERIFIER),
      ),
    ).toEqual({ ok: true, to: S.PASSED });
  });

  it('cancels an assignment nobody needs any more', () => {
    for (const from of OPEN_TESTING_ASSIGNMENT_STATUSES) {
      expect(checkTestingAssignmentAction('cancel', from, theirs(), me(LEAD))).toEqual({
        ok: true,
        to: S.CANCELLED,
      });
    }
  });
});

describe('checkTestingAssignmentAction — state', () => {
  it('refuses a result before the assignment is started', () => {
    // The tester holds the permission; the assignment is simply not in progress yet.
    const check = checkTestingAssignmentAction('pass', S.PENDING, mine(), me());
    expect(check).toMatchObject({ ok: false, reason: 'state' });
    if (check.ok) return;
    expect(check.message).toContain('PENDING');
  });

  it('refuses a question before the assignment is started', () => {
    expect(
      checkTestingAssignmentAction('clarify', S.PENDING, mine(), me(), 'Which tenant?'),
    ).toMatchObject({ ok: false, reason: 'state' });
  });

  it('refuses to start something already in progress', () => {
    expect(checkTestingAssignmentAction('start', S.IN_PROGRESS, mine(), me())).toMatchObject({
      ok: false,
      reason: 'state',
    });
  });

  it.each([S.PASSED, S.FAILED, S.CANCELLED])('refuses every action on a %s assignment', (from) => {
    for (const action of Object.keys(TESTING_ASSIGNMENT_ACTIONS) as TestingAssignmentAction[]) {
      expect(
        checkTestingAssignmentAction(
          action,
          from,
          mine(K.LIVE_VERIFICATION),
          me(EVERYTHING),
          'a note',
        ),
      ).toMatchObject({ ok: false, reason: 'state' });
    }
  });

  it('refuses to re-pass a failure — a retest is a new assignment', () => {
    expect(checkTestingAssignmentAction('pass', S.FAILED, mine(), me(EVERYTHING))).toMatchObject({
      ok: false,
      reason: 'state',
    });
  });
});

describe('checkTestingAssignmentAction — permissions', () => {
  it('refuses a result to someone who may only hand testing out', () => {
    expect(checkTestingAssignmentAction('pass', S.IN_PROGRESS, mine(), me(LEAD))).toMatchObject({
      ok: false,
      reason: 'permission',
    });
  });

  it('refuses a live sign-off to a tester who may only record ordinary results', () => {
    // The point of the separate permission: staging results and production sign-off are not the
    // same trust.
    const check = checkTestingAssignmentAction(
      'verifyLive',
      S.IN_PROGRESS,
      mine(K.LIVE_VERIFICATION),
      me(TESTER),
    );
    expect(check).toMatchObject({ ok: false, reason: 'permission' });
    if (check.ok) return;
    expect(check.message).toContain(PERMISSIONS.QA_VERIFY_LIVE);
  });

  it('refuses a cancellation to the tester holding the assignment', () => {
    expect(checkTestingAssignmentAction('cancel', S.PENDING, mine(), me(TESTER))).toMatchObject({
      ok: false,
      reason: 'permission',
    });
  });

  it('names the permission that is missing', () => {
    const check = checkTestingAssignmentAction('start', S.PENDING, mine(), me([]));
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.message).toContain(PERMISSIONS.QA_RECORD_RESULT);
  });
});

describe('checkTestingAssignmentAction — whose assignment it is', () => {
  it("refuses to record a result on somebody else's assignment", () => {
    expect(checkTestingAssignmentAction('pass', S.IN_PROGRESS, theirs(), me())).toMatchObject({
      ok: false,
      reason: 'assignee',
    });
  });

  it('refuses even to a lead who holds every permission', () => {
    // Deliberate: recording somebody else's result puts a name on evidence they did not gather.
    expect(
      checkTestingAssignmentAction('fail', S.IN_PROGRESS, theirs(), me(EVERYTHING)),
    ).toMatchObject({ ok: false, reason: 'assignee' });
  });

  it('lets anyone with the permission claim an unassigned assignment', () => {
    expect(checkTestingAssignmentAction('start', S.PENDING, unassigned(), me())).toMatchObject({
      ok: true,
    });
  });

  it('does not check ownership for a live verification', () => {
    expect(
      checkTestingAssignmentAction(
        'verifyLive',
        S.IN_PROGRESS,
        theirs(K.LIVE_VERIFICATION),
        me(VERIFIER),
      ),
    ).toMatchObject({ ok: true });
  });

  it("lets a lead cancel somebody else's assignment", () => {
    expect(checkTestingAssignmentAction('cancel', S.IN_PROGRESS, theirs(), me(LEAD))).toMatchObject(
      { ok: true },
    );
  });
});

describe('checkTestingAssignmentAction — the kind of assignment', () => {
  it('refuses to pass a live verification through the ordinary result form', () => {
    // Otherwise qa:verify-live would gate nothing: qa:record-result would sign off production.
    const check = checkTestingAssignmentAction(
      'pass',
      S.IN_PROGRESS,
      mine(K.LIVE_VERIFICATION),
      me(EVERYTHING),
    );
    expect(check).toMatchObject({ ok: false, reason: 'kind' });
    if (check.ok) return;
    expect(check.message).toContain('verify-live');
  });

  it('still lets a live verification be failed with the ordinary permission', () => {
    // Reporting that production is broken is never the restricted direction.
    expect(
      checkTestingAssignmentAction('fail', S.IN_PROGRESS, mine(K.LIVE_VERIFICATION), me(TESTER)),
    ).toMatchObject({ ok: true, to: S.FAILED });
  });

  it('refuses to verify-live anything that is not a live verification', () => {
    for (const kind of [K.QA, K.RETEST, K.UAT] as const) {
      expect(
        checkTestingAssignmentAction('verifyLive', S.IN_PROGRESS, mine(kind), me(EVERYTHING)),
      ).toMatchObject({ ok: false, reason: 'kind' });
    }
  });

  it('refuses every internal action on a UAT assignment', () => {
    for (const action of ['start', 'pass', 'fail', 'clarify'] as const) {
      const check = checkTestingAssignmentAction(
        action,
        action === 'start' ? S.PENDING : S.IN_PROGRESS,
        mine(K.UAT),
        me(EVERYTHING),
        'a note',
      );
      expect(check).toMatchObject({ ok: false, reason: 'kind' });
      if (check.ok) return;
      expect(check.message).toContain('client');
    }
  });

  it('still lets a UAT assignment be cancelled', () => {
    expect(checkTestingAssignmentAction('cancel', S.PENDING, mine(K.UAT), me(LEAD))).toMatchObject({
      ok: true,
    });
  });

  it('treats a retest exactly like ordinary QA', () => {
    expect(checkTestingAssignmentAction('pass', S.IN_PROGRESS, mine(K.RETEST), me())).toMatchObject(
      { ok: true, to: S.PASSED },
    );
  });
});

describe('checkTestingAssignmentAction — questions', () => {
  it('requires a question to send work back', () => {
    expect(checkTestingAssignmentAction('clarify', S.IN_PROGRESS, mine(), me())).toMatchObject({
      ok: false,
      reason: 'note',
    });
  });

  it('does not accept whitespace as a question', () => {
    expect(
      checkTestingAssignmentAction('clarify', S.IN_PROGRESS, mine(), me(), '   '),
    ).toMatchObject({ ok: false, reason: 'note' });
  });

  it('does not demand a question from the actions that have none', () => {
    expect(checkTestingAssignmentAction('pass', S.IN_PROGRESS, mine(), me())).toMatchObject({
      ok: true,
    });
  });
});

describe('the transition table', () => {
  it('leaves the three finished states terminal', () => {
    for (const status of [S.PASSED, S.FAILED, S.CANCELLED]) {
      expect(TESTING_ASSIGNMENT_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('lists exactly the open statuses as the ones with moves left', () => {
    const withMoves = ALL_STATUSES.filter(
      (status) => TESTING_ASSIGNMENT_TRANSITIONS[status].length > 0,
    );
    expect(withMoves.sort()).toEqual([...OPEN_TESTING_ASSIGNMENT_STATUSES].sort());
  });

  it('never allows a status to move to itself', () => {
    for (const status of ALL_STATUSES) {
      expect(canTransitionTestingAssignment(status, status)).toBe(false);
    }
  });

  it('only reaches PASSED, FAILED and CLARIFICATION from IN_PROGRESS', () => {
    for (const to of [S.PASSED, S.FAILED, S.CLARIFICATION] as TestingAssignmentStatus[]) {
      const sources = ALL_STATUSES.filter((from) => canTransitionTestingAssignment(from, to));
      expect(sources).toEqual([S.IN_PROGRESS]);
    }
  });
});

describe('the action table and the transition table agree', () => {
  it('every action targets a state its sources can transition to', () => {
    // A disagreement fails closed in the check, but it is still a bug.
    for (const rule of Object.values(TESTING_ASSIGNMENT_ACTIONS)) {
      for (const from of rule.from) {
        expect(canTransitionTestingAssignment(from, rule.to)).toBe(true);
      }
    }
  });

  it('accepts every source state with the right actor, kind and note', () => {
    for (const [name, rule] of Object.entries(TESTING_ASSIGNMENT_ACTIONS)) {
      const action = name as TestingAssignmentAction;
      const kind = rule.onlyKinds?.[0] ?? K.QA;
      for (const from of rule.from) {
        expect(
          checkTestingAssignmentAction(action, from, mine(kind), me(EVERYTHING), 'a question'),
        ).toEqual({ ok: true, to: rule.to });
      }
    }
  });

  it('refuses every action from every state it does not list', () => {
    for (const [name, rule] of Object.entries(TESTING_ASSIGNMENT_ACTIONS)) {
      const action = name as TestingAssignmentAction;
      const kind = rule.onlyKinds?.[0] ?? K.QA;
      const others = ALL_STATUSES.filter((status) => !rule.from.includes(status));
      for (const from of others) {
        expect(
          checkTestingAssignmentAction(action, from, mine(kind), me(EVERYTHING), 'a question'),
        ).toMatchObject({ ok: false, reason: 'state' });
      }
    }
  });
});

describe('needsRetest', () => {
  it('is true only for a failure the tester marked for retest', () => {
    expect(needsRetest(S.FAILED, true)).toBe(true);
    expect(needsRetest(S.FAILED, false)).toBe(false);
    expect(needsRetest(S.PASSED, true)).toBe(false);
    expect(needsRetest(S.IN_PROGRESS, true)).toBe(false);
  });
});
