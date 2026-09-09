import type { ProjectPlanWindow } from '@ashniva/types';
import { describe, expect, it } from 'vitest';

import { bandFor, monthTicks, todayPercent, windowDays } from './timeline-layout';

const WINDOW: ProjectPlanWindow = {
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  todayDate: '2026-07-02',
};

const EMPTY: ProjectPlanWindow = { startDate: null, endDate: null, todayDate: '2026-07-02' };

describe('timeline layout', () => {
  it('counts the days a window covers, inclusive of both ends', () => {
    expect(windowDays(WINDOW)).toBe(365);
    expect(windowDays({ ...WINDOW, endDate: '2026-01-01' })).toBe(1);
    expect(windowDays(EMPTY)).toBe(0);
  });

  it('places a bar as a share of the window', () => {
    const band = bandFor(WINDOW, '2026-01-01', '2026-01-31');
    expect(band?.offsetPercent).toBe(0);
    expect(band?.widthPercent).toBeCloseTo((31 / 365) * 100, 5);
  });

  it('gives a one-day item a bar wide enough to see', () => {
    const band = bandFor(WINDOW, '2026-06-01', '2026-06-01');
    expect(band?.widthPercent).toBe(1.5);
  });

  it('draws an item that has only one of its two dates', () => {
    expect(bandFor(WINDOW, null, '2026-03-15')).not.toBeNull();
    expect(bandFor(WINDOW, '2026-03-15', null)).not.toBeNull();
  });

  it('has no band for an item with no dates, or in a window with none', () => {
    expect(bandFor(WINDOW, null, null)).toBeNull();
    expect(bandFor(EMPTY, '2026-03-15', '2026-04-15')).toBeNull();
  });

  it('keeps a bar that overruns the window inside it', () => {
    const band = bandFor(WINDOW, '2025-06-01', '2027-06-01');
    expect(band?.offsetPercent).toBe(0);
    expect(band?.widthPercent).toBe(100);
  });

  it('marks today only when today is inside the window', () => {
    expect(todayPercent(WINDOW)).toBeCloseTo((182 / 365) * 100, 5);
    expect(todayPercent({ ...WINDOW, todayDate: '2027-01-05' })).toBeNull();
    expect(todayPercent(EMPTY)).toBeNull();
  });

  it('labels each month inside the window', () => {
    expect(monthTicks(WINDOW)).toHaveLength(12);
    expect(monthTicks(WINDOW)[0]).toMatchObject({ label: 'Jan', percent: 0 });
    expect(monthTicks(EMPTY)).toEqual([]);
  });

  it('thins the labels out rather than drawing hundreds of them', () => {
    const ticks = monthTicks({
      startDate: '2020-01-01',
      endDate: '2030-01-01',
      todayDate: '2026-07-02',
    });
    expect(ticks.length).toBeLessThan(24);
  });
});
