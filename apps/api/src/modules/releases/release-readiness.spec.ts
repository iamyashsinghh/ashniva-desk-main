import {
  PERMISSIONS,
  UAT_DECISION,
  type PermissionKey,
  type ProjectReleasePolicySummary,
  type ReleaseGate,
  type ReleaseReadiness,
  type UatDecision,
} from '@ashniva/types';

import {
  computeReleaseReadiness,
  currentUatState,
  type ReadinessInput,
  type UatRequestState,
} from './release-readiness';

const PUBLISHER: PermissionKey[] = [PERMISSIONS.RELEASE_PUBLISH];

const policy = (
  overrides: Partial<ProjectReleasePolicySummary> = {},
): ProjectReleasePolicySummary => ({
  projectId: 'project',
  approverRoles: [],
  requiresQaPass: false,
  requiresClientUat: false,
  requiresLiveVerification: false,
  requiresTypedConfirmation: false,
  ...overrides,
});

/** An approved release with one item and nothing else to satisfy: the baseline that publishes. */
const ready = (overrides: Partial<ReadinessInput> = {}): ReadinessInput => ({
  status: 'APPROVED',
  itemCount: 1,
  policy: policy(),
  approvals: [],
  qa: { total: 0, passed: 0, failed: 0 },
  uat: { total: 0, approved: 0, changesRequested: 0 },
  permissions: PUBLISHER,
  ...overrides,
});

function gate(readiness: ReleaseReadiness, key: ReleaseGate['key']): ReleaseGate {
  const found = readiness.gates.find((row) => row.key === key);
  if (!found) {
    throw new Error(`no ${key} gate`);
  }
  return found;
}

describe('computeReleaseReadiness', () => {
  it('publishes when nothing is outstanding', () => {
    const readiness = computeReleaseReadiness(ready());
    expect(readiness.publishable).toBe(true);
    expect(readiness.gates.map((row) => row.key)).toEqual([
      'items',
      'approvals',
      'qa',
      'uat',
      'publisher',
    ]);
  });

  it('gives every gate a reason, satisfied or not', () => {
    // A disabled Publish button has to be able to explain itself.
    for (const input of [ready(), ready({ itemCount: 0, status: 'DRAFT' })]) {
      for (const row of computeReleaseReadiness(input).gates) {
        expect(row.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('refuses a release with nothing in it', () => {
    const readiness = computeReleaseReadiness(ready({ itemCount: 0 }));
    expect(gate(readiness, 'items').satisfied).toBe(false);
    expect(readiness.publishable).toBe(false);
  });

  it('refuses a release the state machine would not publish, however green the gates', () => {
    const readiness = computeReleaseReadiness(ready({ status: 'DRAFT' }));
    expect(readiness.gates.every((row) => row.satisfied)).toBe(true);
    expect(readiness.publishable).toBe(false);
  });

  it('reports the typed-confirmation setting so the operator is asked for it', () => {
    expect(
      computeReleaseReadiness(ready({ policy: policy({ requiresTypedConfirmation: true }) }))
        .requiresTypedConfirmation,
    ).toBe(true);
  });
});

describe('the approvals gate', () => {
  it('is satisfied when the project asks for no sign-off', () => {
    expect(gate(computeReleaseReadiness(ready()), 'approvals').satisfied).toBe(true);
  });

  it('waits when the policy names approvers but none were snapshotted yet', () => {
    const readiness = computeReleaseReadiness(
      ready({ policy: policy({ approverRoles: ['QA_LEAD'] }) }),
    );
    expect(gate(readiness, 'approvals')).toMatchObject({
      satisfied: false,
      reason: 'Approval has not been requested yet',
    });
  });

  it('names who it is waiting on', () => {
    const readiness = computeReleaseReadiness(
      ready({
        approvals: [
          { approverRole: 'PROJECT_MANAGER', decision: 'APPROVED' },
          { approverRole: 'QA_LEAD', decision: 'PENDING' },
        ],
      }),
    );
    expect(gate(readiness, 'approvals').satisfied).toBe(false);
    expect(gate(readiness, 'approvals').reason).toContain('QA lead');
  });

  it('blocks on a rejection', () => {
    const readiness = computeReleaseReadiness(
      ready({ approvals: [{ approverRole: 'DIRECTOR', decision: 'REJECTED' }] }),
    );
    expect(gate(readiness, 'approvals').satisfied).toBe(false);
  });

  it('reads the snapshot, not the policy as it stands now', () => {
    // The policy was widened after approval was requested; the release in flight is judged on the
    // signatures it was sent out under.
    const readiness = computeReleaseReadiness(
      ready({
        policy: policy({ approverRoles: ['PROJECT_MANAGER', 'QA_LEAD', 'DIRECTOR'] }),
        approvals: [{ approverRole: 'PROJECT_MANAGER', decision: 'APPROVED' }],
      }),
    );
    expect(gate(readiness, 'approvals').satisfied).toBe(true);
  });
});

describe('the QA gate', () => {
  it('is skipped when the project does not gate on QA', () => {
    const readiness = computeReleaseReadiness(ready({ qa: { total: 0, passed: 0, failed: 0 } }));
    expect(gate(readiness, 'qa').satisfied).toBe(true);
  });

  it('is not satisfied by the absence of QA', () => {
    // Zero checks is how an untested release gets out with a green checklist.
    const readiness = computeReleaseReadiness(
      ready({ policy: policy({ requiresQaPass: true }), qa: { total: 0, passed: 0, failed: 0 } }),
    );
    expect(gate(readiness, 'qa')).toMatchObject({ satisfied: false });
  });

  it('blocks on a failure and on anything still open', () => {
    const failed = computeReleaseReadiness(
      ready({ policy: policy({ requiresQaPass: true }), qa: { total: 3, passed: 2, failed: 1 } }),
    );
    expect(gate(failed, 'qa').satisfied).toBe(false);
    const open = computeReleaseReadiness(
      ready({ policy: policy({ requiresQaPass: true }), qa: { total: 3, passed: 2, failed: 0 } }),
    );
    expect(gate(open, 'qa')).toMatchObject({
      satisfied: false,
      reason: '1 of 3 QA checks are still open',
    });
  });

  it('passes when every check passed', () => {
    const readiness = computeReleaseReadiness(
      ready({ policy: policy({ requiresQaPass: true }), qa: { total: 2, passed: 2, failed: 0 } }),
    );
    expect(gate(readiness, 'qa').satisfied).toBe(true);
    expect(readiness.publishable).toBe(true);
  });
});

describe('the UAT gate', () => {
  const uatPolicy = policy({ requiresClientUat: true });

  it('is skipped when the project does not gate on client UAT', () => {
    expect(gate(computeReleaseReadiness(ready()), 'uat').satisfied).toBe(true);
  });

  it('blocks when the client has not been asked', () => {
    const readiness = computeReleaseReadiness(ready({ policy: uatPolicy }));
    expect(gate(readiness, 'uat')).toMatchObject({ satisfied: false });
  });

  it('blocks when the client asked for changes, even alongside an approval', () => {
    const readiness = computeReleaseReadiness(
      ready({ policy: uatPolicy, uat: { total: 2, approved: 1, changesRequested: 1 } }),
    );
    expect(gate(readiness, 'uat').satisfied).toBe(false);
  });

  it('passes once the client has signed off', () => {
    const readiness = computeReleaseReadiness(
      ready({ policy: uatPolicy, uat: { total: 1, approved: 1, changesRequested: 0 } }),
    );
    expect(gate(readiness, 'uat').satisfied).toBe(true);
  });
});

describe('the publisher gate', () => {
  it('tells a manager who may approve but not publish that the button is not theirs', () => {
    const readiness = computeReleaseReadiness(
      ready({ permissions: [PERMISSIONS.RELEASE_MANAGE, PERMISSIONS.RELEASE_APPROVE] }),
    );
    expect(gate(readiness, 'publisher')).toMatchObject({ satisfied: false });
    expect(gate(readiness, 'publisher').reason).toContain(PERMISSIONS.RELEASE_PUBLISH);
    expect(readiness.publishable).toBe(false);
  });
});

/**
 * The UAT rows the gate is computed from, newest first.
 *
 * The rule these prove is the one that decides whether a client's "request changes" is a note on
 * the ask they answered or a permanent block on the project.
 */
describe('currentUatState', () => {
  const onTask = (taskId: string, status: UatDecision): UatRequestState => ({
    releaseId: null,
    taskId,
    status,
  });

  it('counts the newest request per subject and ignores the ones it replaced', () => {
    // Newest first: the client asked for changes, the change was made, a new sign-off was raised
    // and approved. The release is signed off — the older row is history, not a veto.
    const state = currentUatState([
      onTask('task-1', UAT_DECISION.APPROVED),
      onTask('task-1', UAT_DECISION.CHANGES_REQUESTED),
    ]);
    expect(state).toEqual({ total: 1, approved: 1, changesRequested: 0 });
  });

  it('still blocks while the newest request on a subject asks for changes', () => {
    const state = currentUatState([
      onTask('task-1', UAT_DECISION.CHANGES_REQUESTED),
      onTask('task-1', UAT_DECISION.APPROVED),
    ]);
    expect(state).toEqual({ total: 1, approved: 0, changesRequested: 1 });
  });

  it('keeps subjects apart: one task answered does not answer another', () => {
    const state = currentUatState([
      { releaseId: 'release-1', taskId: null, status: UAT_DECISION.APPROVED },
      onTask('task-2', UAT_DECISION.PENDING),
      onTask('task-1', UAT_DECISION.APPROVED),
    ]);
    expect(state).toEqual({ total: 3, approved: 2, changesRequested: 0 });
  });

  it('is empty when the client has never been asked', () => {
    expect(currentUatState([])).toEqual({ total: 0, approved: 0, changesRequested: 0 });
  });
});
