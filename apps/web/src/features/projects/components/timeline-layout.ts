import type { ProjectPlanWindow } from '@ashniva/types';

/**
 * Where a bar sits on the timeline.
 *
 * Kept apart from the component because it is arithmetic, not markup: the placement of every bar
 * — and of the "today" line, which is what makes a plan readable at a glance — is worth testing
 * without a DOM.
 */
export interface TimelineBand {
  /** Percentage of the chart width, from the left edge. */
  offsetPercent: number;
  widthPercent: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDay(value: string): number {
  return Date.parse(`${value.slice(0, 10)}T00:00:00Z`) / DAY_MS;
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** The number of days the window covers; a single-day window still needs a width to draw in. */
export function windowDays(window: ProjectPlanWindow): number {
  if (!window.startDate || !window.endDate) {
    return 0;
  }
  return Math.max(1, toDay(window.endDate) - toDay(window.startDate) + 1);
}

/**
 * The band an item covers. An item missing one end is drawn as the single day it does have, so a
 * milestone with only a due date still appears rather than silently vanishing.
 */
export function bandFor(
  window: ProjectPlanWindow,
  startDate: string | null,
  endDate: string | null,
): TimelineBand | null {
  const days = windowDays(window);
  if (days === 0 || !window.startDate || (!startDate && !endDate)) {
    return null;
  }
  const origin = toDay(window.startDate);
  const from = toDay(startDate ?? (endDate as string));
  const to = toDay(endDate ?? (startDate as string));
  const offsetPercent = clamp(((from - origin) / days) * 100);
  const endPercent = clamp(((to - origin + 1) / days) * 100);
  return {
    offsetPercent,
    // A bar narrower than a hairline reads as an empty row, so it keeps a visible minimum.
    widthPercent: Math.max(1.5, endPercent - offsetPercent),
  };
}

/** Where today falls across the window, or null when today is outside it. */
export function todayPercent(window: ProjectPlanWindow): number | null {
  const days = windowDays(window);
  if (days === 0 || !window.startDate) {
    return null;
  }
  const offset = ((toDay(window.todayDate) - toDay(window.startDate)) / days) * 100;
  return offset < 0 || offset > 100 ? null : offset;
}

/** The month boundaries inside the window, as gridlines the eye can use to read a date. */
export function monthTicks(window: ProjectPlanWindow): Array<{ label: string; percent: number }> {
  const days = windowDays(window);
  if (days === 0 || !window.startDate || !window.endDate) {
    return [];
  }
  const origin = toDay(window.startDate);
  const ticks: Array<{ label: string; percent: number }> = [];
  const cursor = new Date(`${window.startDate}T00:00:00Z`);
  cursor.setUTCDate(1);
  const last = new Date(`${window.endDate}T00:00:00Z`);
  while (cursor <= last) {
    const percent = ((cursor.getTime() / DAY_MS - origin) / days) * 100;
    if (percent >= 0 && percent <= 100) {
      ticks.push({
        label: cursor.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
        percent,
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    // A window of many years would draw a tick every few pixels; monthly detail stops being
    // readable long before that, so the ticks thin out instead.
    if (ticks.length > 24) {
      return ticks.filter((_, index) => index % 3 === 0);
    }
  }
  return ticks;
}
