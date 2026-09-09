import type { CounterKind, PrismaClient } from '../../src/generated/prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight of today (the value stored in DATE columns). */
export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** UTC midnight, `offset` days from today (negative = past). Used for DATE columns. */
export function dayOffset(offset: number): Date {
  return new Date(today().getTime() + offset * DAY_MS);
}

/** A timestamp on the given day at the given UTC hour (defaults to mid-morning). */
export function at(dayOffsetFromToday: number, hour = 9, minute = 0): Date {
  const day = dayOffset(dayOffsetFromToday);
  return new Date(day.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000);
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Raises a per-organization counter to at least `value`. Never lowers it: re-seeding a database
 * that already holds newer rows (a test run, a demo) must not hand out numbers again.
 */
export async function raiseCounter(
  prisma: PrismaClient,
  organizationId: string,
  kind: CounterKind,
  value: number,
): Promise<void> {
  const existing = await prisma.organizationCounter.findUnique({
    where: { organizationId_kind: { organizationId, kind } },
  });
  if (!existing) {
    await prisma.organizationCounter.create({ data: { organizationId, kind, value } });
    return;
  }
  if (existing.value < value) {
    await prisma.organizationCounter.update({
      where: { organizationId_kind: { organizationId, kind } },
      data: { value },
    });
  }
}
