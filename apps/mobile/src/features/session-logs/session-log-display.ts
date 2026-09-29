import type { RoleKey, SessionLogSession, UserRef } from '@ashniva/types';

import type { QueryParams } from '../../shared/api/client';

/**
 * The arithmetic behind the team login & break log.
 *
 * The API answers with sessions and events, not with totals; the web shows them as two flat
 * tables. A phone has no room for a six-column table, so the sessions are grouped by person and
 * each person carries their own sums — which is also the question a lead opens this screen with:
 * "how long was each of them signed in, and how long were the breaks".
 */

export type RangePreset = 'today' | 'week' | 'month' | 'all' | 'custom';

export const RANGE_PRESETS: readonly { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'all', label: 'Any time' },
  { value: 'custom', label: 'Custom' },
];

/** Calendar days, `YYYY-MM-DD`. Null is an open end, as on the web's blank date inputs. */
export interface DayRange {
  from: string | null;
  to: string | null;
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The days a preset covers, counted back from today in the device's own calendar. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, today = new Date()): DayRange {
  if (preset === 'all') {
    return { from: null, to: null };
  }
  const back = { today: 0, week: 6, month: 29 }[preset];
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
  return { from: isoDay(start), to: isoDay(today) };
}

/**
 * The query `GET /session-logs` takes.
 *
 * The day boundaries are written exactly as the web writes them — start and end of the day in
 * UTC — so the phone and the web page asked the same question show the same rows.
 */
export function sessionLogQuery(input: { userId: string | null } & DayRange): QueryParams {
  return {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.from ? { from: `${input.from}T00:00:00.000Z` } : {}),
    ...(input.to ? { to: `${input.to}T23:59:59.999Z` } : {}),
  };
}

/** "2h 15m", "40m", "12s" — the web's own wording. A dash when the API had nothing to measure. */
export function formatSpan(total: number | null): string {
  if (total === null) {
    return '—';
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${total}s`;
}

export interface PersonSessions {
  user: UserRef;
  roleKey: RoleKey | null;
  /** Newest first: the question is usually about today. */
  sessions: SessionLogSession[];
  /** Closed sessions only. An open one has no length yet, and guessing one would be invented. */
  signedInSeconds: number;
  breakSeconds: number;
  openSessions: number;
}

export function groupByPerson(sessions: readonly SessionLogSession[]): PersonSessions[] {
  const byUser = new Map<string, PersonSessions>();
  for (const session of sessions) {
    const group = byUser.get(session.user.id) ?? {
      user: session.user,
      roleKey: session.roleKey,
      sessions: [],
      signedInSeconds: 0,
      breakSeconds: 0,
      openSessions: 0,
    };
    group.sessions.push(session);
    group.signedInSeconds += session.durationSeconds ?? 0;
    group.breakSeconds += session.breakAfterSeconds ?? 0;
    group.openSessions += session.stillOpen ? 1 : 0;
    byUser.set(session.user.id, group);
  }
  return [...byUser.values()]
    .map((group) => ({
      ...group,
      sessions: [...group.sessions].sort((a, b) => b.loginAt.localeCompare(a.loginAt)),
    }))
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
}

export interface TeamTotals {
  people: number;
  sessions: number;
  signedInSeconds: number;
  breakSeconds: number;
  stillSignedIn: number;
}

export function teamTotals(groups: readonly PersonSessions[]): TeamTotals {
  return groups.reduce<TeamTotals>(
    (sum, group) => ({
      people: sum.people + 1,
      sessions: sum.sessions + group.sessions.length,
      signedInSeconds: sum.signedInSeconds + group.signedInSeconds,
      breakSeconds: sum.breakSeconds + group.breakSeconds,
      stillSignedIn: sum.stillSignedIn + (group.openSessions > 0 ? 1 : 0),
    }),
    { people: 0, sessions: 0, signedInSeconds: 0, breakSeconds: 0, stillSignedIn: 0 },
  );
}
