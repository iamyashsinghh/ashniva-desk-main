import type { WorkLogSummary } from '@ashniva/types';

import type { SegmentOption } from '../../shared/components/navigation-list';

/**
 * Your own time, grouped for reading.
 *
 * One rule shapes this whole feature: it shows **your** entries and nobody else's. `GET
 * /work-logs` will answer with a team's or an organization's when the caller may see them, and
 * that is a reporting screen with a purpose — it is not this one. A phone list of who logged how
 * much is a ranking whatever it is titled, so the request is pinned to the signed-in user's id and
 * there is no control on the screen to widen it.
 */

export type TimeRange = 'today' | 'week';

export const TIME_RANGES: readonly SegmentOption<TimeRange>[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
];

export interface DayGroup {
  /** `YYYY-MM-DD`, as the API returns it. */
  date: string;
  minutes: number;
  entries: WorkLogSummary[];
}

/** The `from`/`to` pair for a range, in the device's own days. */
export function rangeDates(
  range: TimeRange,
  today: Date = new Date(),
): {
  from: string;
  to: string;
} {
  const to = isoDate(today);
  if (range === 'today') {
    return { from: to, to };
  }
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  return { from: isoDate(start), to };
}

/**
 * Entries by day, newest first, each with its own total.
 *
 * Sorted here rather than trusted from the API: the endpoint's order is its own business, and a
 * list that is mostly-but-not-quite in date order is harder to read than an unsorted one.
 */
export function groupByDay(entries: readonly WorkLogSummary[]): DayGroup[] {
  const days = new Map<string, DayGroup>();
  for (const entry of entries) {
    const group = days.get(entry.workDate) ?? { date: entry.workDate, minutes: 0, entries: [] };
    group.minutes += entry.minutes;
    group.entries.push(entry);
    days.set(entry.workDate, group);
  }
  return [...days.values()].sort((left, right) => right.date.localeCompare(left.date));
}

export function totalMinutes(entries: readonly WorkLogSummary[]): number {
  return entries.reduce((sum, entry) => sum + entry.minutes, 0);
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
