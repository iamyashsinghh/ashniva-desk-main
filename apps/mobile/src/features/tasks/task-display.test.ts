import { TASK_ACTION, type TaskActionAvailability } from '@ashniva/types';

import { actionState } from './task-display';

/**
 * What the screen does with the API's answer.
 *
 * The API returns an availability for every action, with a reason when it refuses. The decision
 * here is only about *drawing*: a refusal about timing is shown greyed with its reason, and a
 * refusal about the person is not drawn at all. Either way the API refuses the call — the button
 * is not the control, it is the explanation.
 */

const scheduledForLater: TaskActionAvailability[] = [
  { action: TASK_ACTION.START, enabled: false, reason: 'This task is scheduled to start later' },
  { action: TASK_ACTION.SUBMIT, enabled: false, reason: 'Only the assignee can do this' },
  { action: TASK_ACTION.LOG_WORK, enabled: true },
];

const workable: TaskActionAvailability[] = [
  { action: TASK_ACTION.START, enabled: true },
  { action: TASK_ACTION.LOG_WORK, enabled: true },
];

describe('a task scheduled to start later', () => {
  it('does not offer Start as pressable', () => {
    const state = actionState(scheduledForLater, TASK_ACTION.START, {
      showReasonWhenDisabled: true,
    });
    expect(state.enabled).toBe(false);
  });

  it('says why, rather than leaving somebody looking at a screen with nothing on it', () => {
    // Hiding the button makes an upcoming task look identical to somebody else's, and the person
    // stands there wondering what is wrong with their app.
    const state = actionState(scheduledForLater, TASK_ACTION.START, {
      showReasonWhenDisabled: true,
    });
    expect(state.offered).toBe(true);
    expect(state.reason).toBe('This task is scheduled to start later');
  });

  it('still hides an action refused because of who you are', () => {
    // A greyed control explaining that you are not the assignee is noise, not information.
    expect(actionState(scheduledForLater, TASK_ACTION.SUBMIT)).toEqual({
      offered: false,
      enabled: false,
      reason: null,
    });
  });
});

describe('a task that can be worked on', () => {
  it('offers Start', () => {
    expect(actionState(workable, TASK_ACTION.START, { showReasonWhenDisabled: true })).toEqual({
      offered: true,
      enabled: true,
      reason: null,
    });
  });
});

describe('an action the API did not mention', () => {
  it('is not drawn', () => {
    // A shorter list from an older deployment must not become a button that 404s.
    expect(actionState(workable, TASK_ACTION.UNBLOCK)).toEqual({
      offered: false,
      enabled: false,
      reason: null,
    });
    expect(actionState([], TASK_ACTION.START, { showReasonWhenDisabled: true }).offered).toBe(
      false,
    );
  });
});
