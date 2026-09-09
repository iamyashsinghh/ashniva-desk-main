import {
  PERMISSIONS,
  RELEASE_STATUS,
  type PermissionKey,
  type ReleaseStatus,
} from '@ashniva/types';

import {
  RELEASE_ACTIONS,
  RELEASE_TRANSITIONS,
  canTransitionRelease,
  checkReleaseAction,
  isReleaseEditable,
  isReleaseTerminal,
  mayChangeItems,
  mayChangeVersion,
  type ReleaseAction,
} from './release-workflow';

const MANAGER: PermissionKey[] = [PERMISSIONS.RELEASE_MANAGE];
const APPROVER: PermissionKey[] = [PERMISSIONS.RELEASE_APPROVE];
const PUBLISHER: PermissionKey[] = [PERMISSIONS.RELEASE_PUBLISH];
const EVERYTHING: PermissionKey[] = [...MANAGER, ...APPROVER, ...PUBLISHER];

const ALL_STATUSES = Object.values(RELEASE_STATUS);

describe('checkReleaseAction — the happy path', () => {
  it('sends a draft for approval', () => {
    expect(checkReleaseAction('requestApproval', 'DRAFT', MANAGER)).toEqual({
      ok: true,
      to: 'APPROVAL_REQUESTED',
    });
  });

  it('approves a release that is waiting', () => {
    expect(checkReleaseAction('approve', 'APPROVAL_REQUESTED', APPROVER)).toEqual({
      ok: true,
      to: 'APPROVED',
    });
  });

  it('schedules an approved release, and moves one already scheduled', () => {
    expect(checkReleaseAction('schedule', 'APPROVED', MANAGER)).toEqual({
      ok: true,
      to: 'SCHEDULED',
    });
    // Moving the window is a new time, not a new state.
    expect(checkReleaseAction('schedule', 'SCHEDULED', MANAGER)).toEqual({
      ok: true,
      to: 'SCHEDULED',
    });
  });

  it('publishes from SCHEDULED and straight from APPROVED', () => {
    for (const from of ['APPROVED', 'SCHEDULED'] as const) {
      expect(checkReleaseAction('publish', from, PUBLISHER)).toEqual({
        ok: true,
        to: 'PUBLISHING',
      });
    }
  });

  it('closes the publish, then verifies it live', () => {
    expect(checkReleaseAction('completePublish', 'PUBLISHING', PUBLISHER)).toEqual({
      ok: true,
      to: 'PUBLISHED',
    });
    expect(checkReleaseAction('verifyLive', 'PUBLISHED', MANAGER)).toEqual({
      ok: true,
      to: 'VERIFIED',
    });
  });
});

describe('checkReleaseAction — state', () => {
  it('refuses to publish a draft nobody approved', () => {
    // The route guard says this person may publish; this says not this release, not yet.
    const check = checkReleaseAction('publish', 'DRAFT', PUBLISHER);
    expect(check).toMatchObject({ ok: false, reason: 'state' });
    if (check.ok) return;
    expect(check.message).toContain('DRAFT');
  });

  it('refuses to publish twice', () => {
    expect(checkReleaseAction('publish', 'PUBLISHED', PUBLISHER)).toMatchObject({
      ok: false,
      reason: 'state',
    });
    expect(checkReleaseAction('publish', 'PUBLISHING', PUBLISHER)).toMatchObject({
      ok: false,
      reason: 'state',
    });
  });

  it('refuses to approve a release that was never sent for approval', () => {
    for (const from of ['DRAFT', 'APPROVED', 'SCHEDULED', 'PUBLISHED'] as const) {
      expect(checkReleaseAction('approve', from, APPROVER)).toMatchObject({ ok: false });
    }
  });

  it('refuses everything on a rolled-back release', () => {
    for (const action of Object.keys(RELEASE_ACTIONS) as ReleaseAction[]) {
      expect(checkReleaseAction(action, 'ROLLED_BACK', EVERYTHING, 'a reason')).toMatchObject({
        ok: false,
      });
    }
  });

  it('refuses to verify a release that has not been published', () => {
    expect(checkReleaseAction('verifyLive', 'SCHEDULED', MANAGER)).toMatchObject({
      ok: false,
      reason: 'state',
    });
  });

  it('lets a failed publish go back to draft, and nowhere else', () => {
    expect(checkReleaseAction('reopen', 'FAILED', MANAGER, 'the deploy job died')).toEqual({
      ok: true,
      to: 'DRAFT',
    });
    expect(checkReleaseAction('reopen', 'FAILED', MANAGER)).toMatchObject({
      ok: false,
      reason: 'note',
    });
    expect(checkReleaseAction('publish', 'FAILED', PUBLISHER)).toMatchObject({ ok: false });
    expect(checkReleaseAction('rollback', 'FAILED', PUBLISHER, 'why')).toMatchObject({
      ok: false,
    });
  });
});

describe('checkReleaseAction — permissions', () => {
  it('refuses publication to a manager who may not publish', () => {
    const check = checkReleaseAction('publish', 'APPROVED', MANAGER);
    expect(check).toMatchObject({ ok: false, reason: 'permission' });
    if (check.ok) return;
    expect(check.message).toContain(PERMISSIONS.RELEASE_PUBLISH);
  });

  it('refuses approval to someone who may only manage releases', () => {
    expect(checkReleaseAction('approve', 'APPROVAL_REQUESTED', MANAGER)).toMatchObject({
      ok: false,
      reason: 'permission',
    });
  });

  it('refuses a rollback to an approver, who is not the person who ships', () => {
    expect(checkReleaseAction('rollback', 'PUBLISHED', APPROVER, 'broke checkout')).toMatchObject({
      ok: false,
      reason: 'permission',
    });
  });

  it('names the missing permission rather than merely refusing', () => {
    const check = checkReleaseAction('requestApproval', 'DRAFT', []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.message).toContain(PERMISSIONS.RELEASE_MANAGE);
  });
});

describe('checkReleaseAction — reasons', () => {
  it('requires a reason to roll back', () => {
    expect(checkReleaseAction('rollback', 'PUBLISHED', PUBLISHER)).toMatchObject({
      ok: false,
      reason: 'note',
    });
  });

  it('requires a reason to reject a release', () => {
    expect(checkReleaseAction('reject', 'APPROVAL_REQUESTED', APPROVER)).toMatchObject({
      ok: false,
      reason: 'note',
    });
  });

  it('requires a reason to record a failed publish', () => {
    expect(checkReleaseAction('failPublish', 'PUBLISHING', PUBLISHER)).toMatchObject({
      ok: false,
      reason: 'note',
    });
  });

  it('does not accept whitespace as a reason', () => {
    expect(checkReleaseAction('rollback', 'VERIFIED', PUBLISHER, '   ')).toMatchObject({
      ok: false,
      reason: 'note',
    });
  });

  it('accepts a real one', () => {
    expect(checkReleaseAction('rollback', 'VERIFIED', PUBLISHER, 'checkout 500s')).toEqual({
      ok: true,
      to: 'ROLLED_BACK',
    });
  });
});

describe('the transition table', () => {
  it('covers every status', () => {
    expect(Object.keys(RELEASE_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('names only real statuses as targets', () => {
    for (const targets of Object.values(RELEASE_TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it('leaves exactly one dead end: a release that was pulled', () => {
    const terminal = ALL_STATUSES.filter((status) => isReleaseTerminal(status as ReleaseStatus));
    expect(terminal).toEqual(['ROLLED_BACK']);
  });

  it('cannot skip approval on the way to production', () => {
    expect(canTransitionRelease('DRAFT', 'PUBLISHING')).toBe(false);
    expect(canTransitionRelease('DRAFT', 'PUBLISHED')).toBe(false);
    expect(canTransitionRelease('APPROVAL_REQUESTED', 'PUBLISHING')).toBe(false);
  });

  it('cannot resurrect a rolled-back version', () => {
    for (const status of ALL_STATUSES) {
      expect(canTransitionRelease('ROLLED_BACK', status as ReleaseStatus)).toBe(false);
    }
  });
});

describe('the action table and the transition table agree', () => {
  it('every action targets a state its sources can transition to', () => {
    // If the two ever disagree the check fails closed, but a disagreement is still a bug.
    for (const [action, rule] of Object.entries(RELEASE_ACTIONS)) {
      for (const from of rule.from) {
        expect(checkReleaseAction(action as ReleaseAction, from, EVERYTHING, 'a reason')).toEqual({
          ok: true,
          to: rule.to,
        });
      }
    }
  });

  it('every edge in the machine is reachable by some action', () => {
    // An edge no action can walk is either dead code or a missing endpoint; either way it should
    // not sit in the table unnoticed.
    const walked = new Set(
      Object.values(RELEASE_ACTIONS).flatMap((rule) =>
        rule.from.map((from) => `${from}->${rule.to}`),
      ),
    );
    for (const [from, targets] of Object.entries(RELEASE_TRANSITIONS)) {
      for (const to of targets) {
        expect(walked.has(`${from}->${to}`)).toBe(true);
      }
    }
  });

  it('reaching production always needs release:publish', () => {
    const shipping = Object.values(RELEASE_ACTIONS).filter(
      (rule) => rule.to === 'PUBLISHING' || rule.to === 'PUBLISHED',
    );
    expect(shipping.length).toBeGreaterThan(0);
    for (const rule of shipping) {
      expect(rule.permissions).toContain(PERMISSIONS.RELEASE_PUBLISH);
    }
  });
});

describe('what may still be changed', () => {
  const planning: ReleaseStatus[] = ['DRAFT', 'APPROVAL_REQUESTED', 'APPROVED', 'SCHEDULED'];
  const shipped: ReleaseStatus[] = ['PUBLISHING', 'PUBLISHED', 'VERIFIED', 'ROLLED_BACK', 'FAILED'];

  it.each(planning)('%s is still editable', (status) => {
    expect(isReleaseEditable(status)).toBe(true);
  });

  it.each(shipped)('%s describes something that happened, so it is frozen', (status) => {
    expect(isReleaseEditable(status)).toBe(false);
  });

  it('only lets the contents change while the release is a draft', () => {
    expect(mayChangeItems('DRAFT')).toBe(true);
    for (const status of ALL_STATUSES.filter((value) => value !== 'DRAFT')) {
      expect(mayChangeItems(status as ReleaseStatus)).toBe(false);
    }
  });

  it('fixes the version once approval has been requested', () => {
    // It is what the approvers signed and what the operator types back at publish time.
    expect(mayChangeVersion('DRAFT')).toBe(true);
    expect(mayChangeVersion('APPROVAL_REQUESTED')).toBe(false);
    expect(mayChangeVersion('APPROVED')).toBe(false);
  });
});
