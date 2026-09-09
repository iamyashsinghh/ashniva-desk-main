import {
  minutesToClock,
  resolveAvailability,
  type AvailabilitySource,
  type AvailabilityStatus,
  type AvailabilitySummary,
  type EffectiveAvailability,
  type OnCallEntrySummary,
  type OnCallSource,
  type SupportOwnershipSummary,
  type WorkScheduleSummary,
} from '@ashniva/types';

import type {
  AvailabilityRow,
  OnCallRow,
  SupportOwnershipRow,
  WorkScheduleRow,
} from './support-ownership.repository';

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

export function toWorkSchedule(row: WorkScheduleRow): WorkScheduleSummary {
  return {
    userId: row.userId,
    user: row.user,
    workingDays: row.workingDays,
    startTime: minutesToClock(row.startMinute),
    endTime: minutesToClock(row.endMinute),
    timezone: row.timezone,
    workloadLimit: row.workloadLimit,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAvailability(row: AvailabilityRow): AvailabilitySummary {
  return {
    userId: row.userId,
    user: row.user,
    status: row.status as AvailabilityStatus,
    source: row.source as AvailabilitySource,
    until: row.until?.toISOString() ?? null,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * One person as the router will see them: the stored state, the rota, and the single answer.
 *
 * `effectiveStatus` is computed here rather than stored, using the same shared resolver the router
 * will call. A stored `AVAILABLE` from this morning does not survive a rota that ended at 18:30,
 * and a screen that showed it would be telling a manager something the router disagrees with.
 */
export function toEffectiveAvailability(input: {
  userId: string;
  user: { id: string; name: string; email: string };
  availability: AvailabilityRow | undefined;
  schedule: WorkScheduleRow | undefined;
  onCall: boolean;
  openWorkload?: number;
  projectWorkloadLimit: number | null;
  now?: Date;
}): EffectiveAvailability {
  const schedule = input.schedule ? toWorkSchedule(input.schedule) : null;
  const resolution = resolveAvailability({
    status: (input.availability?.status as AvailabilityStatus | undefined) ?? null,
    until: input.availability?.until ?? null,
    schedule: input.schedule
      ? {
          workingDays: input.schedule.workingDays,
          startMinute: input.schedule.startMinute,
          endMinute: input.schedule.endMinute,
          timezone: input.schedule.timezone,
        }
      : null,
    openWorkload: input.openWorkload,
    // A person's own ceiling wins over the project's, because it is the more specific statement.
    workloadLimit: input.schedule?.workloadLimit ?? input.projectWorkloadLimit,
    onCall: input.onCall,
    now: input.now,
  });

  const base: AvailabilitySummary = input.availability
    ? toAvailability(input.availability)
    : {
        userId: input.userId,
        user: input.user,
        status: resolution.status,
        // Nothing was ever recorded, so the rota is the only thing that spoke.
        source: 'SCHEDULE',
        until: null,
        note: null,
        updatedAt: new Date(0).toISOString(),
      };

  return {
    ...base,
    effectiveStatus: resolution.status,
    withinSchedule: resolution.withinSchedule,
    schedule,
  };
}

export function toOnCallEntry(row: OnCallRow): OnCallEntrySummary {
  return {
    id: row.id,
    projectId: row.projectId,
    onDate: dateOnly(row.onDate),
    user: row.user,
    backupUser: row.backupUser,
    source: row.source as OnCallSource,
    note: row.note,
  };
}

export function toSupportOwnership(row: SupportOwnershipRow): SupportOwnershipSummary {
  return {
    projectId: row.projectId,
    primaryDeveloper: row.primaryDeveloper,
    backupDeveloper: row.backupDeveloper,
    senior: row.senior,
    tester: row.tester,
    supportExecutive: row.supportExecutive,
    moduleOwners: (row.moduleOwners as Record<string, string> | null) ?? {},
    workloadLimit: row.workloadLimit,
    ackMinutes: row.ackMinutes,
    escalationMinutes: row.escalationMinutes,
    directTypes: row.directTypes,
    autoRouteEnabled: row.autoRouteEnabled,
    fallbackUser: row.fallbackUser,
    updatedAt: row.updatedAt.toISOString(),
  };
}
