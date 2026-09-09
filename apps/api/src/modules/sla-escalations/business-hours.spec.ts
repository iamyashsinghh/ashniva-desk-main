import { addBusinessMinutes, businessMinutesBetween, parseClock } from './business-hours';

const KOLKATA = {
  timezone: 'Asia/Kolkata',
  businessHoursStart: '09:00',
  businessHoursEnd: '18:00',
  businessDays: [1, 2, 3, 4, 5],
};
const ALWAYS = {
  timezone: 'UTC',
  businessHoursStart: '00:00',
  businessHoursEnd: '24:00',
  businessDays: [1, 2, 3, 4, 5, 6, 7],
};

// Monday 2026-03-02 10:00 IST = 04:30 UTC
const MONDAY_10_IST = new Date('2026-03-02T04:30:00.000Z');

describe('business hours', () => {
  it('parses clock strings', () => {
    expect(parseClock('09:00')).toBe(540);
    expect(parseClock('18:30')).toBe(1110);
    expect(parseClock('24:00')).toBe(1440);
  });

  it('adds minutes inside the same business day', () => {
    const due = addBusinessMinutes(MONDAY_10_IST, 120, KOLKATA);
    expect(due.toISOString()).toBe('2026-03-02T06:30:00.000Z'); // 12:00 IST
  });

  it('rolls over to the next business day when the day ends', () => {
    // 10:00 + 9h = 8h left today (until 18:00) + 1h tomorrow → Tuesday 10:00 IST
    const due = addBusinessMinutes(MONDAY_10_IST, 9 * 60, KOLKATA);
    expect(due.toISOString()).toBe('2026-03-03T04:30:00.000Z');
  });

  it('skips the weekend', () => {
    // Friday 2026-03-06 17:00 IST + 2h → Monday 10:00 IST
    const friday = new Date('2026-03-06T11:30:00.000Z');
    const due = addBusinessMinutes(friday, 120, KOLKATA);
    expect(due.toISOString()).toBe('2026-03-09T04:30:00.000Z');
  });

  it('starts counting at the next opening when raised out of hours', () => {
    // Saturday 2026-03-07 02:00 IST + 60m → Monday 10:00 IST
    const saturday = new Date('2026-03-06T20:30:00.000Z');
    const due = addBusinessMinutes(saturday, 60, KOLKATA);
    expect(due.toISOString()).toBe('2026-03-09T04:30:00.000Z');
  });

  it('is plain wall-clock arithmetic for 24x7 calendars', () => {
    const due = addBusinessMinutes(MONDAY_10_IST, 90, ALWAYS);
    expect(due.getTime() - MONDAY_10_IST.getTime()).toBe(90 * 60_000);
  });

  it('measures elapsed business minutes across nights and weekends', () => {
    // Friday 17:00 IST → Monday 10:00 IST = 60 + 60 = 120 business minutes
    const friday = new Date('2026-03-06T11:30:00.000Z');
    const monday = new Date('2026-03-09T04:30:00.000Z');
    expect(businessMinutesBetween(friday, monday, KOLKATA)).toBe(120);
    expect(businessMinutesBetween(monday, friday, KOLKATA)).toBe(0);
  });

  it('round-trips: minutes between start and the computed due date equals the target', () => {
    for (const target of [30, 480, 600, 2400]) {
      const due = addBusinessMinutes(MONDAY_10_IST, target, KOLKATA);
      expect(businessMinutesBetween(MONDAY_10_IST, due, KOLKATA)).toBe(target);
    }
  });
});
