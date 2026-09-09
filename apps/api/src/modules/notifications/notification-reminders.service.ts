import { Injectable } from '@nestjs/common';
import {
  CONTRACT_EXPIRY_WARNING_DAYS,
  NOTIFICATION_TYPE,
  OPEN_TASK_STATUSES,
  PERMISSIONS,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { tracksHours } from '../contracts/contract-periods';
import { HourLedgerService } from '../contracts/hour-ledger.service';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationRecipientsService, type Recipient } from './recipients.service';

export interface RemindersResult {
  dueSoon: number;
  overdue: number;
  renewals: number;
  expiries: number;
  lowHours: number;
}

const DAY_MS = 86_400_000;
/** Days-before-end at which an expiry reminder goes out (each one once, by dedupe key). */
const EXPIRY_STEPS = new Set([CONTRACT_EXPIRY_WARNING_DAYS, 14, 7, 3, 1, 0]);

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function daysUntil(target: Date, today: Date): number {
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

/**
 * Time-based notifications produced by the daily job: task due-date reminders and overdue
 * nudges for assignees, contract renewal / expiry warnings and low support-hour alerts for
 * contract managers and the client's administrators. Dedupe keys make re-runs harmless.
 */
@Injectable()
export class NotificationRemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
    private readonly ledger: HourLedgerService,
  ) {}

  async run(now = new Date()): Promise<RemindersResult> {
    const today = new Date(dateKey(now));
    const tomorrow = new Date(today.getTime() + DAY_MS);
    const result: RemindersResult = {
      dueSoon: 0,
      overdue: 0,
      renewals: 0,
      expiries: 0,
      lowHours: 0,
    };
    result.dueSoon = await this.taskReminders(
      tomorrow,
      tomorrow,
      NOTIFICATION_TYPE.TASK_DUE_SOON,
      today,
    );
    result.overdue = await this.taskReminders(null, today, NOTIFICATION_TYPE.TASK_OVERDUE, today);
    const contracts = await this.prisma.contract.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      include: { clientOrganization: { select: { name: true } } },
    });
    for (const contract of contracts) {
      const to = await this.contractRecipients(
        contract.organizationId,
        contract.clientOrganizationId,
      );
      if (contract.endDate) {
        const days = daysUntil(contract.endDate, today);
        if (EXPIRY_STEPS.has(days)) {
          result.expiries += await this.contractNotice(
            contract,
            to,
            NOTIFICATION_TYPE.CONTRACT_EXPIRY,
            days,
            today,
          );
        }
      }
      if (contract.renewalDate) {
        const days = daysUntil(contract.renewalDate, today);
        if (days === contract.renewalNoticeDays || days === 7 || days === 1 || days === 0) {
          result.renewals += await this.contractNotice(
            contract,
            to,
            NOTIFICATION_TYPE.CONTRACT_RENEWAL,
            days,
            today,
          );
        }
      }
      if (tracksHours(contract)) {
        const balance = await this.ledger.ensureCurrentBalance(contract, now);
        if (balance?.isLow) {
          const hours = (balance.remainingMinutes / 60).toFixed(1);
          const sent = await this.dispatcher.notify({
            type: NOTIFICATION_TYPE.SUPPORT_HOURS_LOW,
            title: `Support hours running low on ${contract.numberLabel}`,
            body: `${hours} hours left this period for ${contract.clientOrganization.name}.`,
            entityType: 'contract',
            entityId: contract.id,
            dedupeKey: `hours-low:${contract.id}:${balance.periodStart ?? 'open'}`,
            recipients: to,
          });
          result.lowHours += sent.created;
        }
      }
    }
    return result;
  }

  /** One notification per person per day listing their due-tomorrow or overdue tasks. */
  private async taskReminders(
    from: Date | null,
    to: Date,
    type: 'TASK_DUE_SOON' | 'TASK_OVERDUE',
    today: Date,
  ): Promise<number> {
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        assignedToId: { not: null },
        status: { in: [...OPEN_TASK_STATUSES] },
        dueDate: from ? { gte: from, lte: to } : { lt: to },
      },
      include: { project: { select: { code: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const byAssignee = new Map<string, { organizationId: string; keys: string[] }>();
    for (const task of tasks) {
      const entry = byAssignee.get(task.assignedToId ?? '') ?? {
        organizationId: task.organizationId,
        keys: [],
      };
      entry.keys.push(`${task.project.code}-${task.number} ${task.title}`);
      byAssignee.set(task.assignedToId ?? '', entry);
    }
    const overdue = type === NOTIFICATION_TYPE.TASK_OVERDUE;
    let sent = 0;
    for (const [userId, entry] of byAssignee) {
      const count = entry.keys.length;
      const noun = `task${count === 1 ? '' : 's'}`;
      const result = await this.dispatcher.notify({
        type,
        title: overdue ? `${count} overdue ${noun}` : `${count} ${noun} due tomorrow`,
        body: entry.keys.slice(0, 3).join(' · ') + (count > 3 ? ` · +${count - 3} more` : ''),
        link: overdue ? '/tasks?view=overdue' : '/tasks?view=today',
        entityType: 'task-list',
        entityId: null,
        dedupeKey: `${type}:${userId}:${dateKey(today)}`,
        recipients: await this.recipients.member(entry.organizationId, userId),
      });
      sent += result.created;
    }
    return sent;
  }

  private async contractNotice(
    contract: {
      id: string;
      numberLabel: string;
      title: string;
      clientOrganization: { name: string };
    },
    to: Recipient[],
    type: 'CONTRACT_EXPIRY' | 'CONTRACT_RENEWAL',
    days: number,
    today: Date,
  ): Promise<number> {
    const when = days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`;
    const verb = type === NOTIFICATION_TYPE.CONTRACT_EXPIRY ? 'expires' : 'is due for renewal';
    const result = await this.dispatcher.notify({
      type,
      title: `${contract.numberLabel} ${verb} ${when}`,
      body: `${contract.title} — ${contract.clientOrganization.name}`,
      entityType: 'contract',
      entityId: contract.id,
      dedupeKey: `${type}:${contract.id}:${dateKey(today)}`,
      recipients: to,
    });
    return result.created;
  }

  /** Provider contract managers plus the client organization's contract readers (admins). */
  private async contractRecipients(
    providerId: string,
    clientOrganizationId: string,
  ): Promise<Recipient[]> {
    const [internal, client] = await Promise.all([
      this.recipients.withPermission(providerId, PERMISSIONS.CONTRACT_MANAGE),
      this.recipients.withPermission(clientOrganizationId, PERMISSIONS.CONTRACT_READ),
    ]);
    return [...internal, ...client];
  }
}
