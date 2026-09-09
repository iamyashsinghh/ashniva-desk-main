import { SLA_TARGET_STATUS, type SlaTargetStatus } from '@ashniva/types';

import { addBusinessMinutes, type BusinessCalendar } from './business-hours';

export interface SlaClockInputs {
  calendar: BusinessCalendar;
  warningPercent: number;
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

export interface SlaTargets {
  firstResponseDueAt: Date;
  firstResponseWarnAt: Date;
  resolutionDueAt: Date;
  resolutionWarnAt: Date;
}

/**
 * Due and warning instants for both clocks, starting at `from` with some business minutes
 * already used (after a pause or a priority change). A target that is already exhausted is
 * due immediately.
 */
export function computeTargets(
  from: Date,
  inputs: SlaClockInputs,
  elapsedFirstResponse = 0,
  elapsedResolution = 0,
): SlaTargets {
  const warn = (target: number) => Math.round((target * inputs.warningPercent) / 100);
  const left = (target: number, elapsed: number) => Math.max(0, target - elapsed);
  const { calendar } = inputs;
  return {
    firstResponseDueAt: addBusinessMinutes(
      from,
      left(inputs.firstResponseMinutes, elapsedFirstResponse),
      calendar,
    ),
    firstResponseWarnAt: addBusinessMinutes(
      from,
      left(warn(inputs.firstResponseMinutes), elapsedFirstResponse),
      calendar,
    ),
    resolutionDueAt: addBusinessMinutes(
      from,
      left(inputs.resolutionMinutes, elapsedResolution),
      calendar,
    ),
    resolutionWarnAt: addBusinessMinutes(
      from,
      left(warn(inputs.resolutionMinutes), elapsedResolution),
      calendar,
    ),
  };
}

/** Status of a running (unmet, unpaused) target at `now`. */
export function targetStatus(dueAt: Date, warnAt: Date, now: Date): SlaTargetStatus {
  if (now.getTime() >= dueAt.getTime()) {
    return SLA_TARGET_STATUS.BREACHED;
  }
  if (now.getTime() >= warnAt.getTime()) {
    return SLA_TARGET_STATUS.AT_RISK;
  }
  return SLA_TARGET_STATUS.ON_TRACK;
}

/** Whether a target reached at `metAt` was in time. */
export function metStatus(metAt: Date, dueAt: Date | null): SlaTargetStatus {
  return !dueAt || metAt.getTime() <= dueAt.getTime()
    ? SLA_TARGET_STATUS.MET
    : SLA_TARGET_STATUS.MET_LATE;
}

export function formatDue(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}
