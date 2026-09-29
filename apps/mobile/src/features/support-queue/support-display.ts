import {
  AVAILABILITY_STATUS,
  AVAILABILITY_STATUS_LABELS,
  DEFAULT_WORK_SCHEDULE,
  PRIORITY_LABELS,
  WEEKDAY_LABELS,
  clockToMinutes,
  minutesToClock,
  type AvailabilityStatus,
  type EffectiveAvailability,
  type RoutingTrailRow,
} from '@ashniva/types';
import { AVAILABILITY_STATUS_TONES } from '@ashniva/ui/status-tone';

import type { PillTone } from '../../shared/components/primitives';
import type { SelectOption } from '../../shared/components/SelectSheet';
import type { AvailabilityInput, WorkScheduleInput } from './api';

/** The web's availability colours. Its `review` tone has no pill here; it reads closest to info. */
export function availabilityTone(status: AvailabilityStatus): PillTone {
  const tone = AVAILABILITY_STATUS_TONES[status];
  return tone === 'review' ? 'info' : tone;
}

export const AVAILABILITY_OPTIONS: SelectOption<AvailabilityStatus>[] = Object.values(
  AVAILABILITY_STATUS,
).map((status) => ({ value: status, label: AVAILABILITY_STATUS_LABELS[status] }));

export function hoursLabel(member: EffectiveAvailability): string {
  if (!member.schedule) {
    return 'No working hours configured';
  }
  const { schedule } = member;
  return `${schedule.startTime}–${schedule.endTime} ${schedule.timezone}`;
}

/**
 * Where the recorded state came from. "Recorded" and "Routing sees" are shown apart on purpose:
 * when they disagree, the disagreement is why somebody marked available is being skipped.
 */
export function recordedLabel(member: EffectiveAvailability): string {
  if (member.source === 'SCHEDULE') {
    return 'Nothing recorded — from the rota';
  }
  return `${member.source} · ${new Date(member.updatedAt).toLocaleDateString()}`;
}

/** Monday first, because that is how a working week reads even though Sunday is day 0. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function dayShort(day: number): string {
  return WEEKDAY_LABELS[day]?.slice(0, 3) ?? String(day);
}

export interface ScheduleDraft {
  days: number[];
  startTime: string;
  endTime: string;
  timezone: string;
  limit: string;
}

export function scheduleDraft(member: EffectiveAvailability): ScheduleDraft {
  const existing = member.schedule;
  return {
    days: [...(existing?.workingDays ?? DEFAULT_WORK_SCHEDULE.workingDays)],
    startTime: existing?.startTime ?? minutesToClock(DEFAULT_WORK_SCHEDULE.startMinute),
    endTime: existing?.endTime ?? minutesToClock(DEFAULT_WORK_SCHEDULE.endMinute),
    timezone: existing?.timezone ?? DEFAULT_WORK_SCHEDULE.timezone,
    limit:
      existing?.workloadLimit === null || existing?.workloadLimit === undefined
        ? ''
        : String(existing.workloadLimit),
  };
}

export function toggleDay(days: readonly number[], day: number): number[] {
  return days.includes(day) ? days.filter((value) => value !== day) : [...days, day];
}

/**
 * What stops a schedule being saved, in words. The web's time inputs cannot hold a malformed
 * time; a text field can, so the clock and the limit are checked here before the API sees them.
 */
export function scheduleProblems(draft: ScheduleDraft): {
  start?: string;
  end?: string;
  limit?: string;
} {
  const start = clockToMinutes(draft.startTime);
  const end = clockToMinutes(draft.endTime);
  const problems: { start?: string; end?: string; limit?: string } = {};
  if (start === null) {
    problems.start = 'Use a 24-hour time such as 09:30.';
  }
  if (end === null) {
    problems.end = 'Use a 24-hour time such as 18:30.';
  } else if (start === end) {
    problems.end = 'A shift cannot start and end at the same time.';
  }
  if (draft.limit.trim() !== '' && !/^\d+$/.test(draft.limit.trim())) {
    problems.limit = 'A whole number of tickets, or blank for no limit.';
  }
  return problems;
}

/** An end earlier than the start is a shift that runs past midnight, not a mistake. */
export function isOvernight(draft: ScheduleDraft): boolean {
  const start = clockToMinutes(draft.startTime);
  const end = clockToMinutes(draft.endTime);
  return start !== null && end !== null && end < start;
}

/** Clock times normalised to `HH:MM`, so "9:30" reaches the API as the "09:30" it stores. */
export function scheduleInput(draft: ScheduleDraft): WorkScheduleInput {
  return {
    workingDays: draft.days,
    startTime: minutesToClock(clockToMinutes(draft.startTime) ?? 0),
    endTime: minutesToClock(clockToMinutes(draft.endTime) ?? 0),
    timezone: draft.timezone.trim() || DEFAULT_WORK_SCHEDULE.timezone,
    workloadLimit: draft.limit.trim() === '' ? null : Number(draft.limit.trim()),
  };
}

export function availabilityInput(draft: {
  status: AvailabilityStatus;
  until: string | null;
  note: string;
}): AvailabilityInput {
  return {
    status: draft.status,
    // A date with no time means the end of that day, which is what "on leave until Friday" means.
    until: draft.until ? new Date(`${draft.until}T23:59:59.000Z`).toISOString() : null,
    note: draft.note.trim() || null,
  };
}

/** The project's own team, so the picker offers people who could actually take the ticket. */
export function teamOptions(
  team: readonly EffectiveAvailability[],
  excludeId?: string | null,
): SelectOption[] {
  return team
    .filter((member) => member.userId !== excludeId)
    .map((member) => ({
      value: member.userId,
      label: member.user.name,
      description: member.effectiveStatus === 'AVAILABLE' ? 'available' : 'unavailable',
      icon: 'person-circle-outline',
      iconTone: member.effectiveStatus === 'AVAILABLE' ? 'success' : 'neutral',
    }));
}

export interface TrailAttempt {
  attempt: number;
  policyVersion: number;
  rows: RoutingTrailRow[];
}

/**
 * The trail grouped by attempt: a re-route is a second decision, and reading two as one list
 * makes it look as though the chain was walked twice in a single pass.
 */
export function trailAttempts(rows: readonly RoutingTrailRow[]): TrailAttempt[] {
  const attempts = [...new Set(rows.map((row) => row.attempt))].sort((a, b) => a - b);
  return attempts.map((attempt) => {
    const inAttempt = rows
      .filter((row) => row.attempt === attempt)
      .sort((a, b) => a.position - b.position);
    return { attempt, policyVersion: inAttempt[0]?.policyVersion ?? 0, rows: inAttempt };
  });
}

export function priorityLabel(priority: string): string {
  return priority in PRIORITY_LABELS
    ? PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS]
    : priority;
}
