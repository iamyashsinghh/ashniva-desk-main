import {
  AVAILABILITY_STATUS,
  isWithinSchedule,
  type AvailabilityStatus,
  type WorkScheduleShape,
} from '../domain/availability';

/**
 * One person's stored availability plus their rota, resolved into the single answer the router acts
 * on — and, just as importantly, the reason for it.
 *
 * The router's job in package 8b is to walk a chain of candidates and explain each skip. It cannot
 * do that from a stored status alone, because the stored status is only ever part of the picture:
 * HR says somebody is logged in, but their shift ended an hour ago; nobody has said anything at
 * all, so the rota is the only evidence there is. This function is where those are combined, so
 * that the router has one rule to apply rather than three to remember.
 *
 * Deliberately pure and in `packages/types`: the same resolution has to hold in the API, in a
 * preview on the configuration screen, and in a test, and three copies would eventually disagree.
 */

/** Why somebody is not available. Mirrors `RoutingDecision.trail`'s skip reasons exactly. */
export type UnavailableReason = 'ON_LEAVE' | 'OUT_OF_HOURS' | 'AT_WORKLOAD_LIMIT';

export interface AvailabilityInput {
  /** What was last recorded, from HR or by hand. Null when nothing ever has been. */
  status: AvailabilityStatus | null;
  /** When that state stops applying. A leave that ended is not a leave. */
  until: Date | string | null;
  /** The person's rota, if one is configured. */
  schedule: WorkScheduleShape | null;
  /** How much open work they are holding, and the ceiling. Null limit means no ceiling. */
  openWorkload?: number;
  workloadLimit?: number | null;
  /** Whether they are on call right now, which overrides being outside their hours. */
  onCall?: boolean;
  now?: Date;
}

export interface AvailabilityResolution {
  status: AvailabilityStatus;
  available: boolean;
  /** Set when `available` is false, using the router's own vocabulary. */
  reason: UnavailableReason | null;
  withinSchedule: boolean;
  /** True when the answer came from the rota because nothing more current was known. */
  fromSchedule: boolean;
}

function expired(until: Date | string | null, now: Date): boolean {
  if (until === null) {
    return false;
  }
  const date = until instanceof Date ? until : new Date(until);
  return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime();
}

/**
 * The order of these checks is the order of their authority, and it is the whole design.
 *
 * 1. **Leave wins over everything.** Somebody on approved leave is not available because they are
 *    on call, or because their rota says Tuesday, or because they have capacity. Routing work to
 *    them would be routing it nowhere.
 * 2. **Workload next.** Being at the limit is a real refusal even inside working hours, and it is
 *    the one the router can fix by trying the next candidate rather than by waiting.
 * 3. **On call beats the rota.** That is what on-call cover is for: it exists precisely to make
 *    somebody reachable outside the hours they normally work.
 * 4. **The rota decides the rest**, and a stored `AVAILABLE` does not survive it — an attendance
 *    ping from this morning is not evidence about this evening.
 */
export function resolveAvailability(input: AvailabilityInput): AvailabilityResolution {
  const now = input.now ?? new Date();
  const stored = expired(input.until, now) ? null : input.status;
  const withinSchedule = input.schedule ? isWithinSchedule(input.schedule, now) : false;

  if (stored === AVAILABILITY_STATUS.ON_LEAVE) {
    return {
      status: AVAILABILITY_STATUS.ON_LEAVE,
      available: false,
      reason: 'ON_LEAVE',
      withinSchedule,
      fromSchedule: false,
    };
  }

  const limit = input.workloadLimit ?? null;
  const atLimit = limit !== null && limit > 0 && (input.openWorkload ?? 0) >= limit;
  if (atLimit || stored === AVAILABILITY_STATUS.AT_LIMIT) {
    return {
      status: AVAILABILITY_STATUS.AT_LIMIT,
      available: false,
      reason: 'AT_WORKLOAD_LIMIT',
      withinSchedule,
      fromSchedule: false,
    };
  }

  if (input.onCall) {
    return {
      status: AVAILABILITY_STATUS.AVAILABLE,
      available: true,
      reason: null,
      withinSchedule,
      fromSchedule: false,
    };
  }

  // No rota configured is not the same as "outside hours": nobody said when this person works, so
  // the schedule has no opinion and whatever was last recorded stands.
  if (!input.schedule) {
    const available = stored !== AVAILABILITY_STATUS.OUT_OF_HOURS;
    return {
      status: available ? AVAILABILITY_STATUS.AVAILABLE : AVAILABILITY_STATUS.OUT_OF_HOURS,
      available,
      reason: available ? null : 'OUT_OF_HOURS',
      withinSchedule: false,
      fromSchedule: false,
    };
  }

  if (!withinSchedule) {
    return {
      status: AVAILABILITY_STATUS.OUT_OF_HOURS,
      available: false,
      reason: 'OUT_OF_HOURS',
      withinSchedule: false,
      fromSchedule: true,
    };
  }

  return {
    status: AVAILABILITY_STATUS.AVAILABLE,
    available: true,
    reason: null,
    withinSchedule: true,
    fromSchedule: stored === null,
  };
}
