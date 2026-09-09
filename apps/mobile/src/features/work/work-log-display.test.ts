import type { WorkLogSummary } from '@ashniva/types';

import { groupByDay, rangeDates, totalMinutes } from './work-log-display';

/**
 * The arithmetic behind "my time", tested away from the screen.
 *
 * The grouping is the part that would go wrong quietly: a total that is off by one entry looks
 * exactly like a total that is right, and somebody would sign a timesheet on it.
 */

function entry(workDate: string, minutes: number, id = `${workDate}-${minutes}`): WorkLogSummary {
  return {
    id,
    task: { id: 't1', key: 'ASH-1', title: 'A task' },
    project: { id: 'p1', code: 'ASH', name: 'Ashniva' },
    user: { id: 'u1', name: 'Sam Patel', email: 'sam@example.com' },
    workDate,
    minutes,
    summary: 'Did the thing',
    proofUrl: null,
    gitRef: null,
    createdAt: `${workDate}T17:00:00.000Z`,
  };
}

describe('the range a view asks for', () => {
  it('asks for one day when the view is today', () => {
    expect(rangeDates('today', new Date('2026-09-08T12:00:00'))).toEqual({
      from: '2026-09-08',
      to: '2026-09-08',
    });
  });

  it('asks for seven days including today when the view is the week', () => {
    expect(rangeDates('week', new Date('2026-09-08T12:00:00'))).toEqual({
      from: '2026-09-02',
      to: '2026-09-08',
    });
  });

  it('crosses a month boundary rather than clamping at the first', () => {
    expect(rangeDates('week', new Date('2026-09-03T12:00:00')).from).toBe('2026-08-28');
  });
});

describe('grouping entries by day', () => {
  it('puts a day’s entries together and totals them', () => {
    const days = groupByDay([
      entry('2026-09-08', 30, 'a'),
      entry('2026-09-08', 45, 'b'),
      entry('2026-09-07', 60, 'c'),
    ]);

    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: '2026-09-08', minutes: 75 });
    expect(days[1]).toMatchObject({ date: '2026-09-07', minutes: 60 });
  });

  it('puts the newest day first however the API ordered them', () => {
    const days = groupByDay([entry('2026-09-05', 10), entry('2026-09-09', 10)]);
    expect(days.map((day) => day.date)).toEqual(['2026-09-09', '2026-09-05']);
  });

  it('has nothing to group when there is nothing logged', () => {
    expect(groupByDay([])).toEqual([]);
    expect(totalMinutes([])).toBe(0);
  });
});
