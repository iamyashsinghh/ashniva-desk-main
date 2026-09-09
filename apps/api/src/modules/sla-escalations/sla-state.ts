import {
  SLA_TARGET_STATUS,
  type SlaTargetState,
  type SlaTargetStatus,
  type TicketSla,
} from '@ashniva/types';

/** The stored SLA row of a ticket, as included by the tickets repository. */
export interface TicketSlaRow {
  policy: { id: string; name: string };
  firstResponseDueAt: Date | null;
  firstResponseWarnAt: Date | null;
  firstResponseAt: Date | null;
  firstResponseStatus: string;
  resolutionDueAt: Date | null;
  resolutionWarnAt: Date | null;
  resolvedAt: Date | null;
  resolutionStatus: string;
  pausedAt: Date | null;
  pausedTotalMinutes: number;
}

const SEVERITY: Record<SlaTargetStatus, number> = {
  NONE: 0,
  MET: 1,
  MET_LATE: 2,
  PAUSED: 3,
  ON_TRACK: 4,
  AT_RISK: 5,
  BREACHED: 6,
};

/**
 * Live status of one target. The stored status is refreshed by the monitor job every few
 * minutes; between runs this projection compares the stored due time with "now" so a ticket
 * never shows "on track" after its deadline just because the job has not run yet.
 */
export function projectTarget(
  stored: string,
  dueAt: Date | null,
  warnAt: Date | null,
  metAt: Date | null,
  paused: boolean,
  now: Date,
): SlaTargetState {
  const base = stored as SlaTargetStatus;
  if (base === SLA_TARGET_STATUS.NONE || !dueAt) {
    return {
      status: SLA_TARGET_STATUS.NONE,
      dueAt: null,
      warnAt: null,
      metAt: null,
      remainingMinutes: null,
    };
  }
  const iso = (value: Date | null) => (value ? value.toISOString() : null);
  if (metAt || base === SLA_TARGET_STATUS.MET || base === SLA_TARGET_STATUS.MET_LATE) {
    return {
      status: base,
      dueAt: iso(dueAt),
      warnAt: iso(warnAt),
      metAt: iso(metAt),
      remainingMinutes: null,
    };
  }
  const remaining = Math.round((dueAt.getTime() - now.getTime()) / 60_000);
  if (paused) {
    return {
      status: SLA_TARGET_STATUS.PAUSED,
      dueAt: iso(dueAt),
      warnAt: iso(warnAt),
      metAt: null,
      remainingMinutes: null,
    };
  }
  let status: SlaTargetStatus =
    base === SLA_TARGET_STATUS.PAUSED ? SLA_TARGET_STATUS.ON_TRACK : base;
  if (remaining <= 0) {
    status = SLA_TARGET_STATUS.BREACHED;
  } else if (warnAt && now >= warnAt && status === SLA_TARGET_STATUS.ON_TRACK) {
    status = SLA_TARGET_STATUS.AT_RISK;
  }
  return {
    status,
    dueAt: iso(dueAt),
    warnAt: iso(warnAt),
    metAt: null,
    remainingMinutes: remaining,
  };
}

export function worstStatus(a: SlaTargetStatus, b: SlaTargetStatus): SlaTargetStatus {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

/** API projection of a ticket's SLA state; null when no policy applies to the ticket. */
export function toTicketSla(
  row: TicketSlaRow | null | undefined,
  now = new Date(),
): TicketSla | null {
  if (!row) {
    return null;
  }
  const paused = row.pausedAt !== null;
  const firstResponse = projectTarget(
    row.firstResponseStatus,
    row.firstResponseDueAt,
    row.firstResponseWarnAt,
    row.firstResponseAt,
    paused,
    now,
  );
  const resolution = projectTarget(
    row.resolutionStatus,
    row.resolutionDueAt,
    row.resolutionWarnAt,
    row.resolvedAt,
    paused,
    now,
  );
  return {
    policy: row.policy,
    firstResponse,
    resolution,
    isPaused: paused,
    pausedSince: row.pausedAt ? row.pausedAt.toISOString() : null,
    pausedTotalMinutes: row.pausedTotalMinutes,
    overall: worstStatus(firstResponse.status, resolution.status),
  };
}
