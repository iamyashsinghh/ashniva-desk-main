import { Injectable } from '@nestjs/common';
import { SLA_EVENT_KIND, SLA_TARGET_STATUS, type SlaEventKind } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { businessMinutesBetween } from './business-hours';
import { computeTargets, formatDue, metStatus, targetStatus, type SlaTargets } from './sla-clock';
import { ruleFor, slaInputs, type SlaRule, type TicketSlaRow } from './sla-row';

const MINUTE_MS = 60_000;

/**
 * The state changes of one ticket's SLA row: pause, resume, first response, resolve, reopen,
 * recalculate. Each writes the row and appends an event. TicketSlaService decides which one
 * applies; this class only knows how to apply it.
 */
@Injectable()
export class SlaTransitionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Warning/breach kinds are unique per ticket (partial index), so a retry never duplicates. */
  async addEvent(ticketId: string, kind: SlaEventKind, detail: string | null): Promise<void> {
    await this.prisma.slaEvent.createMany({
      data: [{ ticketId, kind, detail }],
      skipDuplicates: true,
    });
  }

  async pause(row: TicketSlaRow, now: Date, reason: string): Promise<void> {
    const elapsed = this.elapsed(row, now);
    await this.prisma.ticketSla.update({
      where: { ticketId: row.ticketId },
      data: {
        pausedAt: now,
        firstResponseElapsedMinutes: elapsed.firstResponse,
        resolutionElapsedMinutes: elapsed.resolution,
        ...(row.firstResponseAt ? {} : { firstResponseStatus: SLA_TARGET_STATUS.PAUSED }),
        ...(row.resolvedAt ? {} : { resolutionStatus: SLA_TARGET_STATUS.PAUSED }),
        lastEvaluatedAt: now,
      },
    });
    await this.addEvent(row.ticketId, SLA_EVENT_KIND.PAUSED, reason);
  }

  async resume(row: TicketSlaRow, now: Date): Promise<void> {
    const pausedMinutes = this.pausedMinutes(row, now);
    const rule = ruleFor(row);
    const targets = rule
      ? computeTargets(
          now,
          slaInputs(row.policy, rule),
          row.firstResponseElapsedMinutes,
          row.resolutionElapsedMinutes,
        )
      : null;
    await this.prisma.ticketSla.update({
      where: { ticketId: row.ticketId },
      data: {
        pausedAt: null,
        pausedTotalMinutes: row.pausedTotalMinutes + pausedMinutes,
        clockStartedAt: now,
        ...(targets ?? {}),
        ...this.runningStatuses(row, targets, now),
        lastEvaluatedAt: now,
      },
    });
    await this.addEvent(
      row.ticketId,
      SLA_EVENT_KIND.RESUMED,
      `Paused for ${pausedMinutes} minutes`,
    );
  }

  async firstResponse(row: TicketSlaRow, now: Date): Promise<void> {
    const status = this.metStatusFor(row, 'firstResponse', now);
    await this.prisma.ticketSla.update({
      where: { ticketId: row.ticketId },
      data: { firstResponseAt: now, firstResponseStatus: status, lastEvaluatedAt: now },
    });
    await this.addEvent(
      row.ticketId,
      SLA_EVENT_KIND.FIRST_RESPONSE_MET,
      status === SLA_TARGET_STATUS.MET ? 'Replied within target' : 'Replied after the target',
    );
  }

  async resolve(row: TicketSlaRow, now: Date): Promise<void> {
    const resolution = this.metStatusFor(row, 'resolution', now);
    const firstResponse = row.firstResponseAt ? null : this.metStatusFor(row, 'firstResponse', now);
    await this.prisma.ticketSla.update({
      where: { ticketId: row.ticketId },
      data: {
        resolvedAt: now,
        resolutionStatus: resolution,
        ...(firstResponse ? { firstResponseAt: now, firstResponseStatus: firstResponse } : {}),
        ...(row.pausedAt
          ? {
              pausedAt: null,
              pausedTotalMinutes: row.pausedTotalMinutes + this.pausedMinutes(row, now),
            }
          : {}),
        lastEvaluatedAt: now,
      },
    });
    await this.addEvent(
      row.ticketId,
      SLA_EVENT_KIND.RESOLUTION_MET,
      resolution === SLA_TARGET_STATUS.MET ? 'Resolved within target' : 'Resolved after the target',
    );
  }

  /** Reopening restarts the resolution clock; the first response stays as it was. */
  async reopen(row: TicketSlaRow, now: Date): Promise<void> {
    const rule = ruleFor(row);
    const targets = rule ? computeTargets(now, slaInputs(row.policy, rule)) : null;
    await this.prisma.ticketSla.update({
      where: { ticketId: row.ticketId },
      data: {
        resolvedAt: null,
        resolutionStatus: SLA_TARGET_STATUS.ON_TRACK,
        resolutionElapsedMinutes: 0,
        clockStartedAt: now,
        pausedAt: null,
        ...(targets
          ? { resolutionDueAt: targets.resolutionDueAt, resolutionWarnAt: targets.resolutionWarnAt }
          : {}),
        lastEvaluatedAt: now,
      },
    });
    const detail = targets
      ? `Reopened: resolution due ${formatDue(targets.resolutionDueAt, row.policy.timezone)}`
      : 'Reopened';
    await this.addEvent(row.ticketId, SLA_EVENT_KIND.RECALCULATED, detail);
  }

  /** New targets (priority or policy changed); business minutes already used stay used. */
  async recalculate(row: TicketSlaRow, rule: SlaRule, now: Date, reason: string): Promise<void> {
    const elapsed = this.elapsed(row, now);
    const paused = row.pausedAt !== null;
    const targets = computeTargets(
      now,
      slaInputs(row.policy, rule),
      elapsed.firstResponse,
      elapsed.resolution,
    );
    await this.prisma.ticketSla.update({
      where: { ticketId: row.ticketId },
      data: {
        policyId: row.policy.id,
        ...targets,
        firstResponseElapsedMinutes: elapsed.firstResponse,
        resolutionElapsedMinutes: elapsed.resolution,
        ...(paused ? {} : { clockStartedAt: now, ...this.runningStatuses(row, targets, now) }),
        lastEvaluatedAt: now,
      },
    });
    await this.addEvent(
      row.ticketId,
      SLA_EVENT_KIND.RECALCULATED,
      `${reason}: resolution due ${formatDue(targets.resolutionDueAt, row.policy.timezone)}`,
    );
  }

  // ---- helpers ------------------------------------------------------------------------------

  private pausedMinutes(row: TicketSlaRow, now: Date): number {
    return row.pausedAt
      ? Math.max(0, Math.round((now.getTime() - row.pausedAt.getTime()) / MINUTE_MS))
      : 0;
  }

  /** Business minutes used on each clock up to `now` (frozen while paused). */
  private elapsed(row: TicketSlaRow, now: Date): { firstResponse: number; resolution: number } {
    if (row.pausedAt) {
      return {
        firstResponse: row.firstResponseElapsedMinutes,
        resolution: row.resolutionElapsedMinutes,
      };
    }
    const running = businessMinutesBetween(row.clockStartedAt, now, row.policy);
    return {
      firstResponse: row.firstResponseElapsedMinutes + running,
      resolution: row.resolutionElapsedMinutes + running,
    };
  }

  private runningStatuses(row: TicketSlaRow, targets: SlaTargets | null, now: Date) {
    if (!targets) {
      return {};
    }
    return {
      ...(row.firstResponseAt
        ? {}
        : {
            firstResponseStatus: targetStatus(
              targets.firstResponseDueAt,
              targets.firstResponseWarnAt,
              now,
            ),
          }),
      ...(row.resolvedAt
        ? {}
        : {
            resolutionStatus: targetStatus(targets.resolutionDueAt, targets.resolutionWarnAt, now),
          }),
    };
  }

  private metStatusFor(row: TicketSlaRow, target: 'firstResponse' | 'resolution', now: Date) {
    if (!row.pausedAt) {
      return metStatus(
        now,
        target === 'firstResponse' ? row.firstResponseDueAt : row.resolutionDueAt,
      );
    }
    // The stored due date is stale while paused: judge by the business minutes actually used.
    const rule = ruleFor(row);
    const used =
      target === 'firstResponse' ? row.firstResponseElapsedMinutes : row.resolutionElapsedMinutes;
    const limit = target === 'firstResponse' ? rule?.firstResponseMinutes : rule?.resolutionMinutes;
    return limit === undefined || used <= limit
      ? SLA_TARGET_STATUS.MET
      : SLA_TARGET_STATUS.MET_LATE;
  }
}
