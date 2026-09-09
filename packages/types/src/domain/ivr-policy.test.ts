import {
  RECORDING_DENIAL_REASON,
  RECORDING_PLAYBACK_SCOPE,
  RECORDING_POLICY,
  canPlayRecording,
  shouldRecord,
  type RecordingAccessInput,
} from './ivr-policy';

/**
 * Who may listen to a client describing their problem.
 *
 * This is the most consequential decision in package 9, so it is tested here rather than only
 * through the API: the API can show that *a* refusal happened, but these tests are what say the
 * refusals are the right ones and — just as important — that the permitted cases are permitted.
 */

function access(over: Partial<RecordingAccessInput> = {}): RecordingAccessInput {
  return {
    isInternal: true,
    hasPlaybackPermission: true,
    administersIvr: false,
    projectRole: 'LEAD',
    isConnectedStaff: false,
    scope: RECORDING_PLAYBACK_SCOPE.LEADS_ONLY,
    hasRecording: true,
    ...over,
  };
}

describe('canPlayRecording', () => {
  it('lets the project lead play a recording under the default scope', () => {
    expect(canPlayRecording(access())).toEqual({ allowed: true, reason: null });
  });

  it('lets the project manager play a recording under the default scope', () => {
    expect(canPlayRecording(access({ projectRole: 'MANAGER' })).allowed).toBe(true);
  });

  it('refuses every client, whatever else they hold', () => {
    const decision = canPlayRecording(
      access({
        isInternal: false,
        hasPlaybackPermission: true,
        administersIvr: true,
        projectRole: 'MANAGER',
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RECORDING_DENIAL_REASON.NOT_INTERNAL);
  });

  it('refuses somebody who may read the ticket but holds no playback permission', () => {
    const decision = canPlayRecording(access({ hasPlaybackPermission: false }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RECORDING_DENIAL_REASON.NO_PERMISSION);
  });

  it('refuses a developer who is not on the ticket’s project', () => {
    const decision = canPlayRecording(access({ projectRole: null }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RECORDING_DENIAL_REASON.NOT_ON_PROJECT);
  });

  it('refuses a developer on the project while the scope is leads only', () => {
    const decision = canPlayRecording(access({ projectRole: 'DEVELOPER' }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RECORDING_DENIAL_REASON.OUTSIDE_SCOPE);
  });

  it('refuses a tester on the project while the scope is leads only', () => {
    expect(canPlayRecording(access({ projectRole: 'TESTER' })).allowed).toBe(false);
  });

  it('admits the developer who took the call once the scope says so', () => {
    const decision = canPlayRecording(
      access({
        projectRole: 'DEVELOPER',
        isConnectedStaff: true,
        scope: RECORDING_PLAYBACK_SCOPE.CONNECTED_STAFF,
      }),
    );

    expect(decision.allowed).toBe(true);
  });

  it('still refuses a different developer under the connected-staff scope', () => {
    const decision = canPlayRecording(
      access({
        projectRole: 'DEVELOPER',
        isConnectedStaff: false,
        scope: RECORDING_PLAYBACK_SCOPE.CONNECTED_STAFF,
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RECORDING_DENIAL_REASON.OUTSIDE_SCOPE);
  });

  it('admits any permitted project member under the widest scope', () => {
    const decision = canPlayRecording(
      access({ projectRole: 'DEVELOPER', scope: RECORDING_PLAYBACK_SCOPE.PROJECT_STAFF }),
    );

    expect(decision.allowed).toBe(true);
  });

  it('still refuses a non-member under the widest scope', () => {
    const decision = canPlayRecording(
      access({ projectRole: null, scope: RECORDING_PLAYBACK_SCOPE.PROJECT_STAFF }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RECORDING_DENIAL_REASON.NOT_ON_PROJECT);
  });

  it('admits whoever administers the policy, without a project membership', () => {
    const decision = canPlayRecording(access({ administersIvr: true, projectRole: null }));

    expect(decision.allowed).toBe(true);
  });

  it('says there is nothing to play before it says who may play it', () => {
    const decision = canPlayRecording(access({ hasRecording: false, administersIvr: true }));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(RECORDING_DENIAL_REASON.NO_RECORDING);
  });

  it('reports a client as a client rather than as unpermitted', () => {
    const decision = canPlayRecording(
      access({ isInternal: false, hasPlaybackPermission: false, hasRecording: false }),
    );

    expect(decision.reason).toBe(RECORDING_DENIAL_REASON.NOT_INTERNAL);
  });
});

describe('shouldRecord', () => {
  it('records nothing when the product has recording switched off', () => {
    expect(shouldRecord(RECORDING_POLICY.DISABLED, true)).toBe(false);
  });

  it('records only with consent when the policy asks for it', () => {
    expect(shouldRecord(RECORDING_POLICY.ON_CONSENT, false)).toBe(false);
    expect(shouldRecord(RECORDING_POLICY.ON_CONSENT, true)).toBe(true);
  });

  it('records regardless of the flag when the policy always records', () => {
    expect(shouldRecord(RECORDING_POLICY.ALWAYS, false)).toBe(true);
  });
});
