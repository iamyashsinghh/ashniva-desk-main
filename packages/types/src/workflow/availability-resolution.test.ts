import {
  AVAILABILITY_STATUS,
  DEFAULT_WORK_SCHEDULE,
  clockToMinutes,
  isWithinSchedule,
  localDayAndMinute,
  minutesToClock,
  type WorkScheduleShape,
} from '../domain/availability';
import { resolveAvailability } from './availability-resolution';

/**
 * The rota and the resolver, which together decide whether the router may send somebody a ticket.
 *
 * Fixed instants throughout: a test that asks "is it working hours" against the real clock passes
 * in the afternoon and fails overnight.
 */

// 2026-09-07 is a Monday. 06:30 UTC is 12:00 in Asia/Kolkata (UTC+5:30).
const MONDAY_NOON_IST = new Date('2026-09-07T06:30:00.000Z');
const MONDAY_2300_IST = new Date('2026-09-07T17:30:00.000Z');
const SUNDAY_NOON_IST = new Date('2026-09-06T06:30:00.000Z');

describe('clock conversion', () => {
  it('round-trips a clock time', () => {
    expect(minutesToClock(570)).toBe('09:30');
    expect(clockToMinutes('09:30')).toBe(570);
    expect(minutesToClock(clockToMinutes('18:30') ?? 0)).toBe('18:30');
  });

  it('refuses anything that is not a clock time rather than guessing', () => {
    for (const value of ['', 'nine', '25:00', '09:70', '9', '09:5']) {
      expect({ value, minutes: clockToMinutes(value) }).toEqual({ value, minutes: null });
    }
  });

  it('reads midnight as minute zero', () => {
    expect(clockToMinutes('00:00')).toBe(0);
    expect(minutesToClock(0)).toBe('00:00');
  });
});

describe('localDayAndMinute', () => {
  it('reports the local day and time, not the UTC one', () => {
    // 17:30 UTC on Monday is 23:00 Monday in Kolkata — same day, very different hour.
    expect(localDayAndMinute(MONDAY_2300_IST, 'Asia/Kolkata')).toEqual({ day: 1, minute: 23 * 60 });
  });

  it('rolls over the day where the zone does', () => {
    // 19:00 UTC Monday is 00:30 Tuesday in Kolkata.
    expect(localDayAndMinute(new Date('2026-09-07T19:00:00.000Z'), 'Asia/Kolkata')).toEqual({
      day: 2,
      minute: 30,
    });
  });
});

describe('isWithinSchedule — an ordinary day shift', () => {
  it('is inside during the working day on a working day', () => {
    expect(isWithinSchedule(DEFAULT_WORK_SCHEDULE, MONDAY_NOON_IST)).toBe(true);
  });

  it('is outside in the evening', () => {
    expect(isWithinSchedule(DEFAULT_WORK_SCHEDULE, MONDAY_2300_IST)).toBe(false);
  });

  it('is outside on a non-working day, whatever the hour', () => {
    expect(isWithinSchedule(DEFAULT_WORK_SCHEDULE, SUNDAY_NOON_IST)).toBe(false);
  });

  it('includes the start minute and excludes the end minute', () => {
    // 04:00 UTC is 09:30 IST — the first minute of the shift.
    expect(isWithinSchedule(DEFAULT_WORK_SCHEDULE, new Date('2026-09-07T04:00:00.000Z'))).toBe(
      true,
    );
    // 13:00 UTC is 18:30 IST — the minute it ends, which is no longer inside it.
    expect(isWithinSchedule(DEFAULT_WORK_SCHEDULE, new Date('2026-09-07T13:00:00.000Z'))).toBe(
      false,
    );
  });

  it('is never inside a schedule with no working days', () => {
    expect(isWithinSchedule({ ...DEFAULT_WORK_SCHEDULE, workingDays: [] }, MONDAY_NOON_IST)).toBe(
      false,
    );
  });
});

describe('isWithinSchedule — a shift that crosses midnight', () => {
  // 22:00 to 06:00, Monday to Friday. The hours after midnight belong to the day it started.
  const night: WorkScheduleShape = {
    workingDays: [1, 2, 3, 4, 5],
    startMinute: 22 * 60,
    endMinute: 6 * 60,
    timezone: 'Asia/Kolkata',
  };

  it('is inside late on a working night', () => {
    // 17:00 UTC is 22:30 Monday IST.
    expect(isWithinSchedule(night, new Date('2026-09-07T17:00:00.000Z'))).toBe(true);
  });

  it('is inside in the small hours of the following morning', () => {
    // 21:00 UTC Monday is 02:30 Tuesday IST — still Monday night's shift.
    expect(isWithinSchedule(night, new Date('2026-09-07T21:00:00.000Z'))).toBe(true);
  });

  it('attributes the small hours to the night that started them', () => {
    // 2026-09-04 is a Friday: 21:00 UTC is 02:30 Saturday IST, still Friday night's shift.
    expect(isWithinSchedule(night, new Date('2026-09-04T21:00:00.000Z'))).toBe(true);
    // 2026-09-05 is a Saturday, which is not a working night — so Sunday's small hours are out.
    expect(isWithinSchedule(night, new Date('2026-09-05T21:00:00.000Z'))).toBe(false);
  });

  it('is outside during the day', () => {
    expect(isWithinSchedule(night, MONDAY_NOON_IST)).toBe(false);
  });
});

describe('resolveAvailability — authority order', () => {
  const base = { status: null, until: null, schedule: DEFAULT_WORK_SCHEDULE, now: MONDAY_NOON_IST };

  it('lets leave beat everything, including being on call and inside hours', () => {
    const result = resolveAvailability({
      ...base,
      status: AVAILABILITY_STATUS.ON_LEAVE,
      onCall: true,
    });
    expect(result).toMatchObject({ available: false, reason: 'ON_LEAVE' });
  });

  it('refuses somebody at their workload limit even inside their hours', () => {
    const result = resolveAvailability({ ...base, openWorkload: 5, workloadLimit: 5 });
    expect(result).toMatchObject({ available: false, reason: 'AT_WORKLOAD_LIMIT' });
  });

  it('does not treat a workload below the limit as a refusal', () => {
    expect(resolveAvailability({ ...base, openWorkload: 4, workloadLimit: 5 }).available).toBe(
      true,
    );
  });

  it('ignores a workload limit of zero or null rather than blocking everyone', () => {
    expect(resolveAvailability({ ...base, openWorkload: 9, workloadLimit: null }).available).toBe(
      true,
    );
    expect(resolveAvailability({ ...base, openWorkload: 9, workloadLimit: 0 }).available).toBe(
      true,
    );
  });

  it('lets on-call cover beat the rota, which is what on-call is for', () => {
    const result = resolveAvailability({ ...base, now: MONDAY_2300_IST, onCall: true });
    expect(result).toMatchObject({ available: true, withinSchedule: false });
  });

  it('does not let a stale attendance ping beat the rota', () => {
    // HR said AVAILABLE this morning; it is now 23:00 and the shift ended at 18:30.
    const result = resolveAvailability({
      ...base,
      status: AVAILABILITY_STATUS.AVAILABLE,
      now: MONDAY_2300_IST,
    });
    expect(result).toMatchObject({ available: false, reason: 'OUT_OF_HOURS', fromSchedule: true });
  });
});

describe('resolveAvailability — what the stored state is for', () => {
  const base = { until: null, schedule: DEFAULT_WORK_SCHEDULE, now: MONDAY_NOON_IST };

  it('falls back to the rota when nothing has ever been recorded', () => {
    const result = resolveAvailability({ ...base, status: null });
    expect(result).toMatchObject({ available: true, fromSchedule: true });
  });

  it('marks the answer as not from the rota once HR has said something', () => {
    const result = resolveAvailability({ ...base, status: AVAILABILITY_STATUS.AVAILABLE });
    expect(result).toMatchObject({ available: true, fromSchedule: false });
  });

  it('stops applying a state once its until has passed', () => {
    // Leave that ended at 09:00 does not make somebody unavailable at noon.
    const result = resolveAvailability({
      ...base,
      status: AVAILABILITY_STATUS.ON_LEAVE,
      until: new Date('2026-09-07T03:30:00.000Z'),
    });
    expect(result.available).toBe(true);
  });

  it('keeps applying a state whose until is still ahead', () => {
    const result = resolveAvailability({
      ...base,
      status: AVAILABILITY_STATUS.ON_LEAVE,
      until: new Date('2026-09-09T03:30:00.000Z'),
    });
    expect(result).toMatchObject({ available: false, reason: 'ON_LEAVE' });
  });
});

describe('resolveAvailability — nobody configured a rota', () => {
  const base = { until: null, schedule: null, now: MONDAY_2300_IST };

  it('does not invent working hours for somebody who has none', () => {
    // No rota is not the same as "outside hours" — the schedule simply has no opinion.
    const result = resolveAvailability({ ...base, status: null });
    expect(result).toMatchObject({ available: true, withinSchedule: false });
  });

  it('still honours an explicit out-of-hours state', () => {
    const result = resolveAvailability({ ...base, status: AVAILABILITY_STATUS.OUT_OF_HOURS });
    expect(result).toMatchObject({ available: false, reason: 'OUT_OF_HOURS' });
  });

  it('still honours leave and the workload limit', () => {
    expect(resolveAvailability({ ...base, status: AVAILABILITY_STATUS.ON_LEAVE }).reason).toBe(
      'ON_LEAVE',
    );
    expect(
      resolveAvailability({ ...base, status: null, openWorkload: 3, workloadLimit: 3 }).reason,
    ).toBe('AT_WORKLOAD_LIMIT');
  });
});
