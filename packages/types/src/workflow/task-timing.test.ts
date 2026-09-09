import { AT_RISK_WINDOW_MINUTES, TASK_TIMING, computeTaskTiming, isUpcoming } from './task-timing';

/**
 * The timing verdict, which is the one number a manager acts on.
 *
 * Written against fixed instants rather than `Date.now()` so that "due soon" does not become "late"
 * because the suite ran slowly.
 */

const NOW = new Date('2026-09-07T12:00:00.000Z');
const at = (iso: string) => new Date(iso);

const timing = (over: Partial<Parameters<typeof computeTaskTiming>[0]> = {}) =>
  computeTaskTiming({
    dueAt: at('2026-09-07T17:00:00.000Z'),
    completedAt: null,
    estimateMinutes: 120,
    loggedMinutes: 0,
    now: NOW,
    ...over,
  });

describe('computeTaskTiming — finished work', () => {
  it('is on time when it finished before the expected time', () => {
    const result = timing({ completedAt: at('2026-09-07T16:30:00.000Z') });
    expect(result.status).toBe(TASK_TIMING.ON_TIME);
    expect(result.delayMinutes).toBeNull();
  });

  it('is on time when it finished exactly at the expected time', () => {
    // The boundary belongs to on time: a deadline met to the minute has been met.
    expect(timing({ completedAt: at('2026-09-07T17:00:00.000Z') }).status).toBe(
      TASK_TIMING.ON_TIME,
    );
  });

  it('is delayed by the minute when it finished late', () => {
    const result = timing({ completedAt: at('2026-09-07T18:45:00.000Z') });
    expect(result.status).toBe(TASK_TIMING.DELAYED);
    expect(result.delayMinutes).toBe(105);
  });
});

describe('computeTaskTiming — open work', () => {
  it('is in hand while the deadline is comfortably ahead', () => {
    expect(timing().status).toBe(TASK_TIMING.IN_HAND);
  });

  it('is at risk once the deadline is inside the warning window', () => {
    const result = timing({ dueAt: at('2026-09-07T13:30:00.000Z') });
    expect(result.status).toBe(TASK_TIMING.AT_RISK);
    expect(result.minutesUntilDue).toBe(90);
    expect(result.minutesUntilDue).toBeLessThanOrEqual(AT_RISK_WINDOW_MINUTES);
  });

  // The two sides of AT_RISK_WINDOW_MINUTES, written as instants rather than as arithmetic on the
  // constant, so moving the window has to move these on purpose.
  it('is at risk exactly on the edge of the warning window', () => {
    const result = timing({ dueAt: at('2026-09-07T14:00:00.000Z') });
    expect(result.minutesUntilDue).toBe(AT_RISK_WINDOW_MINUTES);
    expect(result.status).toBe(TASK_TIMING.AT_RISK);
  });

  it('is still in hand one minute outside the warning window', () => {
    const result = timing({ dueAt: at('2026-09-07T14:01:00.000Z') });
    expect(result.minutesUntilDue).toBe(AT_RISK_WINDOW_MINUTES + 1);
    expect(result.status).toBe(TASK_TIMING.IN_HAND);
  });

  it('is at risk rather than delayed at the deadline itself', () => {
    // Zero minutes left is not yet late: a deadline is missed after it passes, not on it.
    const result = timing({ dueAt: NOW });
    expect(result.minutesUntilDue).toBe(0);
    expect(result.status).toBe(TASK_TIMING.AT_RISK);
  });

  it('is delayed by one minute one minute after the deadline', () => {
    const result = timing({ dueAt: at('2026-09-07T11:59:00.000Z') });
    expect(result.status).toBe(TASK_TIMING.DELAYED);
    expect(result.delayMinutes).toBe(1);
    expect(result.minutesUntilDue).toBe(-1);
  });

  it('is delayed once the deadline has passed, without waiting for completion', () => {
    // The point of the indicator: a task nobody has finished is the one worth flagging.
    const result = timing({ dueAt: at('2026-09-07T09:00:00.000Z') });
    expect(result.status).toBe(TASK_TIMING.DELAYED);
    expect(result.delayMinutes).toBe(180);
  });
});

describe('computeTaskTiming — effort versus lateness', () => {
  it('reports overrun separately, so a task can be on time and over its estimate', () => {
    const result = timing({
      completedAt: at('2026-09-07T16:00:00.000Z'),
      estimateMinutes: 120,
      loggedMinutes: 400,
    });
    expect(result.status).toBe(TASK_TIMING.ON_TIME);
    expect(result.overrunMinutes).toBe(280);
  });

  it('reports a task that was late while taking less effort than planned', () => {
    const result = timing({
      completedAt: at('2026-09-07T19:00:00.000Z'),
      estimateMinutes: 300,
      loggedMinutes: 60,
    });
    expect(result.status).toBe(TASK_TIMING.DELAYED);
    expect(result.delayMinutes).toBe(120);
    expect(result.overrunMinutes).toBe(-240);
  });

  it('calls a zero overrun zero rather than nothing, so "exactly as estimated" is sayable', () => {
    expect(timing({ estimateMinutes: 120, loggedMinutes: 120 }).overrunMinutes).toBe(0);
  });

  it('leaves overrun unanswered when nobody estimated', () => {
    expect(timing({ estimateMinutes: null, loggedMinutes: 90 }).overrunMinutes).toBeNull();
  });
});

describe('computeTaskTiming — nothing to compare against', () => {
  it('is unscheduled without a due time, but still reports effort', () => {
    const result = timing({ dueAt: null, estimateMinutes: 60, loggedMinutes: 75 });
    expect(result.status).toBe(TASK_TIMING.UNSCHEDULED);
    expect(result.delayMinutes).toBeNull();
    expect(result.minutesUntilDue).toBeNull();
    expect(result.overrunMinutes).toBe(15);
  });

  it('treats an unparseable date as no date rather than guessing', () => {
    expect(timing({ dueAt: 'not a date' }).status).toBe(TASK_TIMING.UNSCHEDULED);
  });

  it('accepts ISO strings, which is what the API returns', () => {
    const result = timing({
      dueAt: '2026-09-07T17:00:00.000Z',
      completedAt: '2026-09-07T18:00:00.000Z',
    });
    expect(result.status).toBe(TASK_TIMING.DELAYED);
    expect(result.delayMinutes).toBe(60);
  });
});

describe('isUpcoming', () => {
  it('is upcoming only while the scheduled start is still ahead', () => {
    expect(isUpcoming(at('2026-09-07T14:00:00.000Z'), NOW)).toBe(true);
    expect(isUpcoming(at('2026-09-07T11:00:00.000Z'), NOW)).toBe(false);
  });

  it('is not upcoming at the scheduled minute itself — that is when it becomes workable', () => {
    expect(isUpcoming(at('2026-09-07T12:00:00.000Z'), NOW)).toBe(false);
  });

  it('is not upcoming when nothing was scheduled', () => {
    expect(isUpcoming(null, NOW)).toBe(false);
  });
});
