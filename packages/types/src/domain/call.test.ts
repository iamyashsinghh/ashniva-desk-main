import {
  CALL_STATUS,
  canTransitionCall,
  isCallTerminal,
  mapCallDisposition,
  shouldTryNextDestination,
} from './call';

/**
 * The call lifecycle.
 *
 * Provider events arrive late, twice, and out of order. These tests are about that: the graph has
 * to make a stale event a no-op rather than a corruption, and a redelivered one harmless.
 */

describe('canTransitionCall', () => {
  it('walks the ordinary path from request to completion', () => {
    expect(canTransitionCall(CALL_STATUS.REQUESTED, CALL_STATUS.RINGING)).toBe(true);
    expect(canTransitionCall(CALL_STATUS.RINGING, CALL_STATUS.CONNECTED)).toBe(true);
    expect(canTransitionCall(CALL_STATUS.CONNECTED, CALL_STATUS.COMPLETED)).toBe(true);
  });

  it('lets a call that never rang fail or be cancelled', () => {
    expect(canTransitionCall(CALL_STATUS.REQUESTED, CALL_STATUS.FAILED)).toBe(true);
    expect(canTransitionCall(CALL_STATUS.REQUESTED, CALL_STATUS.CANCELLED)).toBe(true);
  });

  it('refuses to roll a connected call back to ringing', () => {
    expect(canTransitionCall(CALL_STATUS.CONNECTED, CALL_STATUS.RINGING)).toBe(false);
  });

  it('refuses a no-answer for a call somebody answered', () => {
    expect(canTransitionCall(CALL_STATUS.CONNECTED, CALL_STATUS.NO_ANSWER)).toBe(false);
  });

  it('refuses to move a call that is already over', () => {
    expect(canTransitionCall(CALL_STATUS.COMPLETED, CALL_STATUS.RINGING)).toBe(false);
    expect(canTransitionCall(CALL_STATUS.NO_ANSWER, CALL_STATUS.CONNECTED)).toBe(false);
    expect(canTransitionCall(CALL_STATUS.CANCELLED, CALL_STATUS.COMPLETED)).toBe(false);
  });

  it('treats a redelivery of the state a call is already in as no move at all', () => {
    expect(canTransitionCall(CALL_STATUS.RINGING, CALL_STATUS.RINGING)).toBe(false);
    expect(canTransitionCall(CALL_STATUS.CONNECTED, CALL_STATUS.CONNECTED)).toBe(false);
  });
});

describe('isCallTerminal', () => {
  it('recognises every way a call stops', () => {
    expect(isCallTerminal(CALL_STATUS.COMPLETED)).toBe(true);
    expect(isCallTerminal(CALL_STATUS.NO_ANSWER)).toBe(true);
    expect(isCallTerminal(CALL_STATUS.BUSY)).toBe(true);
    expect(isCallTerminal(CALL_STATUS.FAILED)).toBe(true);
    expect(isCallTerminal(CALL_STATUS.CANCELLED)).toBe(true);
  });

  it('does not treat a live call as finished', () => {
    expect(isCallTerminal(CALL_STATUS.REQUESTED)).toBe(false);
    expect(isCallTerminal(CALL_STATUS.RINGING)).toBe(false);
    expect(isCallTerminal(CALL_STATUS.CONNECTED)).toBe(false);
  });
});

describe('mapCallDisposition', () => {
  it('reads the same outcome however the provider spells it', () => {
    expect(mapCallDisposition('no-answer', false)).toBe(CALL_STATUS.NO_ANSWER);
    expect(mapCallDisposition('NO_ANSWER', false)).toBe(CALL_STATUS.NO_ANSWER);
    expect(mapCallDisposition('noAnswer', false)).toBe(CALL_STATUS.NO_ANSWER);
  });

  it('maps the ordinary outcomes', () => {
    expect(mapCallDisposition('answered', true)).toBe(CALL_STATUS.COMPLETED);
    expect(mapCallDisposition('busy', false)).toBe(CALL_STATUS.BUSY);
    expect(mapCallDisposition('failed', false)).toBe(CALL_STATUS.FAILED);
    expect(mapCallDisposition('cancelled', false)).toBe(CALL_STATUS.CANCELLED);
  });

  it('completes an unrecognised end to a call somebody was on', () => {
    expect(mapCallDisposition('vendor-specific-word', true)).toBe(CALL_STATUS.COMPLETED);
  });

  it('fails an unrecognised end to a call nobody was ever on, so the chain gets another go', () => {
    expect(mapCallDisposition('vendor-specific-word', false)).toBe(CALL_STATUS.FAILED);
    expect(mapCallDisposition(null, false)).toBe(CALL_STATUS.FAILED);
    expect(mapCallDisposition(undefined, false)).toBe(CALL_STATUS.FAILED);
  });
});

describe('shouldTryNextDestination', () => {
  it('tries the next destination for every way of not reaching somebody', () => {
    expect(shouldTryNextDestination(CALL_STATUS.NO_ANSWER)).toBe(true);
    expect(shouldTryNextDestination(CALL_STATUS.BUSY)).toBe(true);
    expect(shouldTryNextDestination(CALL_STATUS.FAILED)).toBe(true);
  });

  it('does not try anybody else after a call that connected or was called off', () => {
    expect(shouldTryNextDestination(CALL_STATUS.COMPLETED)).toBe(false);
    expect(shouldTryNextDestination(CALL_STATUS.CANCELLED)).toBe(false);
  });
});
