import { Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  NOTIFICATION_TYPE,
  PERMISSIONS,
  SLA_EVENT_KIND,
  SLA_EVENT_KIND_LABELS,
  SLA_TARGET_STATUS,
  type SlaEventKind,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { REALTIME_EVENTS } from '../../infrastructure/realtime/realtime-rooms';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import { targetStatus } from './sla-clock';
import { slaRowInclude, type TicketSlaRow } from './sla-row';
import { SlaTransitionsService } from './sla-transitions.service';

export interface SlaMonitorResult {
  evaluated: number;
  warnings: number;
  breaches: number;
}

const RUNNING = [SLA_TARGET_STATUS.ON_TRACK, SLA_TARGET_STATUS.AT_RISK];

/**
 * How many overdue SLA clocks one pass evaluates.
 *
 * The query had no ceiling, so a backlog — a monitor that had not run for a while, or a burst of
 * tickets past their warning threshold at once — was read whole into memory and then walked one
 * update at a time. The bound makes a pass finite; passes converge because evaluating a clock
 * moves it out of the set (ON_TRACK -> AT_RISK -> BREACHED), and the ordering takes the most
 * overdue first, so the oldest breach is never the one left behind.
 */
const EVALUATION_BATCH = 500;

/**
 * Turns elapsed time into AT_RISK / BREACHED states. Runs from the sla-monitor queue every few
 * minutes and on demand; idempotent because warning and breach events are unique per ticket.
 */
@Injectable()
export class SlaMonitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: SlaTransitionsService,
    private readonly auditLog: AuditLogService,
    private readonly realtime: RealtimeService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  async run(now = new Date()): Promise<SlaMonitorResult> {
    const rows = await this.prisma.ticketSla.findMany({
      where: {
        pausedAt: null,
        ticket: { deletedAt: null },
        OR: [
          {
            firstResponseAt: null,
            firstResponseStatus: { in: RUNNING },
            firstResponseWarnAt: { lte: now },
          },
          { resolvedAt: null, resolutionStatus: { in: RUNNING }, resolutionWarnAt: { lte: now } },
        ],
      },
      include: slaRowInclude,
      orderBy: [{ resolutionDueAt: { sort: 'asc', nulls: 'last' } }, { ticketId: 'asc' }],
      take: EVALUATION_BATCH,
    });
    const result: SlaMonitorResult = { evaluated: rows.length, warnings: 0, breaches: 0 };
    const unchanged: string[] = [];
    for (const row of rows) {
      const outcome = await this.evaluate(row, now);
      result.warnings += outcome.warnings;
      result.breaches += outcome.breaches;
      if (!outcome.changed) {
        unchanged.push(row.ticketId);
      }
    }
    // Every row used to take an UPDATE of its own even when its status had not moved, purely to
    // stamp `lastEvaluatedAt`. Most rows in a pass are in that state; one statement stamps them.
    if (unchanged.length > 0) {
      await this.prisma.ticketSla.updateMany({
        where: { ticketId: { in: unchanged } },
        data: { lastEvaluatedAt: now },
      });
    }
    return result;
  }

  private async evaluate(
    row: TicketSlaRow,
    now: Date,
  ): Promise<{ warnings: number; breaches: number; changed: boolean }> {
    const data: Record<string, unknown> = {};
    const events: SlaEventKind[] = [];
    if (!row.firstResponseAt && row.firstResponseDueAt && row.firstResponseWarnAt) {
      const next = targetStatus(row.firstResponseDueAt, row.firstResponseWarnAt, now);
      if (next !== row.firstResponseStatus && next !== SLA_TARGET_STATUS.ON_TRACK) {
        data.firstResponseStatus = next;
        events.push(
          next === SLA_TARGET_STATUS.BREACHED
            ? SLA_EVENT_KIND.FIRST_RESPONSE_BREACHED
            : SLA_EVENT_KIND.FIRST_RESPONSE_WARNING,
        );
      }
    }
    if (!row.resolvedAt && row.resolutionDueAt && row.resolutionWarnAt) {
      const next = targetStatus(row.resolutionDueAt, row.resolutionWarnAt, now);
      if (next !== row.resolutionStatus && next !== SLA_TARGET_STATUS.ON_TRACK) {
        data.resolutionStatus = next;
        events.push(
          next === SLA_TARGET_STATUS.BREACHED
            ? SLA_EVENT_KIND.RESOLUTION_BREACHED
            : SLA_EVENT_KIND.RESOLUTION_WARNING,
        );
      }
    }
    if (events.length === 0) {
      // Nothing moved; the caller stamps `lastEvaluatedAt` for the whole batch in one statement.
      return { warnings: 0, breaches: 0, changed: false };
    }
    await this.prisma.ticketSla.update({
      where: { ticketId: row.ticketId },
      data: { ...data, lastEvaluatedAt: now },
    });
    let warnings = 0;
    let breaches = 0;
    for (const kind of events) {
      const breached = kind.endsWith('BREACHED');
      await this.transitions.addEvent(
        row.ticketId,
        kind,
        breached ? 'Target missed' : 'Warning threshold reached',
      );
      if (breached) {
        breaches += 1;
        await this.auditLog.record({
          action: AUDIT_ACTION.SLA_BREACHED,
          entityType: AUDIT_ENTITY_TYPE.TICKET,
          entityId: row.ticketId,
          organizationId: row.ticket.organizationId,
          after: { key: `T-${row.ticket.number}`, target: kind, policy: row.policy.name },
        });
      } else {
        warnings += 1;
      }
      await this.alert(row, kind);
    }
    const payload = {
      id: row.ticketId,
      projectId: row.ticket.projectId,
      status: row.ticket.status,
      changedByUserId: 'system',
      at: now.toISOString(),
    };
    this.realtime.emitToProject(
      row.ticket.organizationId,
      row.ticket.projectId,
      REALTIME_EVENTS.TICKET_UPDATED,
      payload,
    );
    if (row.ticket.clientOrganizationId !== row.ticket.organizationId) {
      this.realtime.emitToOrganization(
        row.ticket.clientOrganizationId,
        REALTIME_EVENTS.TICKET_UPDATED,
        payload,
      );
    }
    return { warnings, breaches, changed: true };
  }

  /** The assignee (or the triage team when unassigned) hears about warnings and breaches. */
  private async alert(row: TicketSlaRow, kind: SlaEventKind): Promise<void> {
    const breached = kind.endsWith('BREACHED');
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: row.ticketId },
      select: { assignedToId: true, title: true },
    });
    const recipients = ticket?.assignedToId
      ? await this.recipients.member(row.ticket.organizationId, ticket.assignedToId)
      : await this.recipients.withPermission(row.ticket.organizationId, PERMISSIONS.TICKET_TRIAGE);
    await this.dispatcher.notify({
      type: breached ? NOTIFICATION_TYPE.SLA_BREACH : NOTIFICATION_TYPE.SLA_WARNING,
      title: `${SLA_EVENT_KIND_LABELS[kind]}: T-${row.ticket.number} ${ticket?.title ?? ''}`.trim(),
      body: `Policy ${row.policy.name}`,
      link: `/tickets/${row.ticketId}`,
      entityType: 'ticket',
      entityId: row.ticketId,
      dedupeKey: `sla:${row.ticketId}:${kind}`,
      recipients,
    });
  }
}
