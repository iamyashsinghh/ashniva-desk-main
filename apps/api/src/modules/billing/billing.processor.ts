import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { isSettledInvoiceStatus } from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { QueueSchedulerRegistrar } from '../../infrastructure/queue/scheduled-jobs';
import { BillingNotificationsService } from './billing-notifications.service';
import { BillingRepository } from './billing.repository';

export const BILLING_SWEEP_JOB = 'billing-sweep';

/**
 * Whether an invoice is still worth chasing the client about.
 *
 * Read from a row loaded after the sweep has done its writing, never from the one the batch was
 * selected on. Both sweeps select candidates, then act row by row — a payment committing anywhere
 * in that window makes the message untrue, and the client is the one who receives it.
 */
function stillChaseable(invoice: {
  status: string;
  balanceDue: { greaterThan(n: number): boolean };
}): boolean {
  return !isSettledInvoiceStatus(invoice.status) && invoice.balanceDue.greaterThan(0);
}

/** 07:00 IST. Early enough to act on, late enough not to arrive overnight. */
const SWEEP_CRON = '30 1 * * *';
/** How far ahead a "due soon" reminder looks. */
const DUE_SOON_DAYS = 3;

/**
 * The most invoices one pass will chase, per phase.
 *
 * The repository already defaulted to this; it is named and passed here so the bound is visible
 * where the loop is, not hidden in a default argument two files away. Each candidate costs two
 * `findDetail` reads (the second is deliberate — see `markOverdue`), so the ceiling is what keeps
 * a daily job from becoming a thousand-query one.
 *
 * Reaching it means there is a backlog the sweep did not finish, which is worth a log line: the
 * next run picks up where this one stopped only because the same invoices still qualify.
 */
const SWEEP_BATCH = 500;

/**
 * The daily billing sweep: marks overdue invoices and sends the reminders.
 *
 * Runs as the system actor because one pass covers every tenant; each invoice it touches is
 * loaded by id with its own organization, so nothing crosses a tenant boundary.
 *
 * Both notifications carry a dated de-duplication key, so an invoice that stays unpaid is
 * chased again tomorrow rather than silenced after the first message.
 */
@Injectable()
@Processor(QUEUE_NAMES.BILLING)
export class BillingProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.BILLING) private readonly queue: Queue,
    private readonly repository: BillingRepository,
    private readonly notifications: BillingNotificationsService,
    private readonly tenantContext: TenantContextService,
    private readonly schedulers: QueueSchedulerRegistrar,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(BillingProcessor.name);
  }

  onModuleInit(): Promise<void> {
    return this.schedulers.register(this.queue, QUEUE_NAMES.BILLING, [
      {
        id: BILLING_SWEEP_JOB,
        pattern: SWEEP_CRON,
        // The sweep runs once a day. Without retries a single blip — a database restart, a
        // moment of contention — means no overdue marking and no reminders until tomorrow.
        jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
      },
    ]);
  }

  async process(job: Job): Promise<{ overdue: number; dueSoon: number }> {
    if (job.name !== BILLING_SWEEP_JOB) {
      this.logger.warn({ jobName: job.name }, 'Ignoring an unknown job on the billing queue');
      return { overdue: 0, dueSoon: 0 };
    }
    return this.sweep();
  }

  async sweep(now = new Date()): Promise<{ overdue: number; dueSoon: number }> {
    return this.tenantContext.runAsSystem(async () => {
      const overdue = await this.markOverdue(now);
      const dueSoon = await this.remindDueSoon(now);
      return { overdue, dueSoon };
    });
  }

  private async markOverdue(now: Date): Promise<number> {
    const candidates = await this.repository.overdueCandidates(now, SWEEP_BATCH);
    this.warnIfCapped(candidates.length, 'overdue');
    let handled = 0;

    for (const candidate of candidates) {
      const invoice = await this.repository.findDetail(candidate.organizationId, candidate.id);
      if (!invoice) {
        continue;
      }
      // The status is only advanced from ISSUED; a partly paid invoice keeps that status, which
      // is the more useful fact, and the due date still says it is late. Conditional on ISSUED in
      // the write as well as the read: a payment settling the invoice between the two would
      // otherwise be overwritten, leaving it OVERDUE with a zero balance.
      if (invoice.status === 'ISSUED') {
        await this.repository.transitionStatus(invoice.id, 'ISSUED', 'OVERDUE');
      }

      // Re-read before telling anyone. The write above is conditional precisely because a payment
      // can land between the read and it; the notification was not, and it was built from the row
      // read *before* the write. So a client who settled an invoice minutes earlier was emailed
      // "₹1,18,000.00 was due on …" — the figure and the claim both taken from a row that had
      // already stopped being true. The conditional write silently matching nothing was exactly
      // the case where the message was most wrong.
      const fresh = await this.repository.findDetail(candidate.organizationId, candidate.id);
      if (!fresh || !stillChaseable(fresh)) {
        continue;
      }
      await this.notifications.invoiceOverdue(fresh, now);
      handled += 1;
    }
    return handled;
  }

  private async remindDueSoon(now: Date): Promise<number> {
    const to = new Date(now);
    to.setUTCDate(to.getUTCDate() + DUE_SOON_DAYS);

    const candidates = await this.repository.dueSoon(now, to, SWEEP_BATCH);
    this.warnIfCapped(candidates.length, 'due-soon');
    let handled = 0;

    for (const candidate of candidates) {
      const invoice = await this.repository.findDetail(candidate.organizationId, candidate.id);
      // Same guard as the overdue pass, and for the same reason: `dueSoon` selected on a balance
      // above zero, and this row is read afterwards. Without it a client who paid in between was
      // reminded that "0.00 outstanding" was due.
      if (!invoice || !stillChaseable(invoice)) {
        continue;
      }
      await this.notifications.paymentDueSoon(invoice, now);
      handled += 1;
    }
    return handled;
  }

  private warnIfCapped(found: number, phase: string): void {
    if (found >= SWEEP_BATCH) {
      this.logger.warn(
        { phase, batch: SWEEP_BATCH },
        'The billing sweep filled its batch; some invoices were not reached this run',
      );
    }
  }
}
