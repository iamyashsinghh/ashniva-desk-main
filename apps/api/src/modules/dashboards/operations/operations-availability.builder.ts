import {
  resolveAvailability,
  type AvailabilityStatus,
  type OperationsAvailabilityEntry,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import type { OperationsMember } from './operations-members';

/**
 * Who is reachable right now, and why not when they are not.
 *
 * Guarded by `support-routing:manage` at the caller, because that is the permission that guards
 * the availability and on-call screens themselves — a dashboard that showed this to somebody who
 * cannot open those screens would be a way around them.
 *
 * The verdict comes from `resolveAvailability`, the same function the ticket router applies, so
 * the screen cannot say "available" about somebody the router will skip. No workload is passed
 * in: capacity is arithmetic over numbers that change between a page load and a routing decision,
 * and the router does it at the moment it decides. What this answers is the stable half — leave,
 * rota and on-call cover.
 *
 * Three queries for any number of people.
 */
export async function buildOperationsAvailability(
  prisma: PrismaService,
  organizationId: string,
  today: Date,
  members: OperationsMember[],
  projectIds: string[],
  now = new Date(),
): Promise<OperationsAvailabilityEntry[]> {
  const ids = members.map((member) => member.userId);
  if (ids.length === 0) {
    return [];
  }
  const [availability, schedules, onCall] = await Promise.all([
    prisma.userAvailability.findMany({
      where: { organizationId, userId: { in: ids } },
      select: { userId: true, status: true, until: true },
    }),
    prisma.userWorkSchedule.findMany({
      where: { organizationId, userId: { in: ids } },
      select: {
        userId: true,
        workingDays: true,
        startMinute: true,
        endMinute: true,
        timezone: true,
      },
    }),
    prisma.onCallSchedule.findMany({
      where: {
        organizationId,
        onDate: today,
        // Not conditional on the list being non-empty. A lead who is on no active project covers
        // no on-call rota, and an empty `in` says exactly that; dropping the predicate instead
        // would answer the organization-wide question and mark their people on call for projects
        // the lead does not cover. `OnCallSchedule.projectId` is non-nullable, so there are no
        // organization-wide rows this could wrongly exclude.
        projectId: { in: projectIds },
      },
      select: { userId: true, backupUserId: true },
    }),
  ]);
  const storedByUser = new Map(availability.map((row) => [row.userId, row]));
  const scheduleByUser = new Map(schedules.map((row) => [row.userId, row]));
  // Backup cover counts: somebody named as the backup for today is on call for today.
  const onCallUsers = new Set<string>();
  for (const row of onCall) {
    onCallUsers.add(row.userId);
    if (row.backupUserId) {
      onCallUsers.add(row.backupUserId);
    }
  }
  return members.map((member) => {
    const stored = storedByUser.get(member.userId);
    const schedule = scheduleByUser.get(member.userId);
    const onCallNow = onCallUsers.has(member.userId);
    const resolution = resolveAvailability({
      status: (stored?.status as AvailabilityStatus | undefined) ?? null,
      until: stored?.until ?? null,
      schedule: schedule
        ? {
            workingDays: schedule.workingDays,
            startMinute: schedule.startMinute,
            endMinute: schedule.endMinute,
            timezone: schedule.timezone,
          }
        : null,
      onCall: onCallNow,
      now,
    });
    return {
      user: member.user,
      status: resolution.status,
      available: resolution.available,
      reason: resolution.reason,
      withinSchedule: resolution.withinSchedule,
      fromSchedule: resolution.fromSchedule,
      onCall: onCallNow,
      schedule: schedule
        ? {
            workingDays: schedule.workingDays,
            startMinute: schedule.startMinute,
            endMinute: schedule.endMinute,
            timezone: schedule.timezone,
          }
        : null,
    };
  });
}
