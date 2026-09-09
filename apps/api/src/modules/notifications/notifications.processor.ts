import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { QueueSchedulerRegistrar } from '../../infrastructure/queue/scheduled-jobs';
import { NotificationDispatcher } from './notification-dispatcher.service';
import {
  NotificationRemindersService,
  type RemindersResult,
} from './notification-reminders.service';
import { NotificationsRepository } from './notifications.repository';

export const DELIVER_JOB = 'deliver-deferred';
export const REMINDERS_JOB = 'daily-reminders';
/** 08:30 IST every day. */
const REMINDERS_CRON = '0 3 * * *';
const DELIVER_CRON = '* * * * *';

/**
 * Two scheduled jobs on the notifications queue: every minute, push notifications whose quiet
 * hours or rate-limit deferral has ended; every morning, run the time-based reminders.
 */
@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly queue: Queue,
    private readonly notifications: NotificationsRepository,
    private readonly dispatcher: NotificationDispatcher,
    private readonly reminders: NotificationRemindersService,
    private readonly tenantContext: TenantContextService,
    private readonly schedulers: QueueSchedulerRegistrar,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(NotificationsProcessor.name);
  }

  onModuleInit(): Promise<void> {
    return this.schedulers.register(this.queue, QUEUE_NAMES.NOTIFICATIONS, [
      { id: DELIVER_JOB, pattern: DELIVER_CRON },
      { id: REMINDERS_JOB, pattern: REMINDERS_CRON },
    ]);
  }

  async process(job: Job): Promise<unknown> {
    return job.name === REMINDERS_JOB ? this.runReminders() : this.runDeliveries();
  }

  /**
   * Deliberately serial, and deliberately capped by `dueForDelivery`'s own `take`.
   *
   * The dispatcher groups and rate-limits per recipient, reading and writing that person's recent
   * history as it goes; delivering their notifications in parallel would race that state and
   * reorder what they receive. The batch is bounded at 500, each item mostly enqueues an outbound
   * job rather than talking to a provider, and the next run is a minute away — so the serial loop
   * is a latency choice on a bounded batch, not an unbounded sweep.
   */
  async runDeliveries(now = new Date()): Promise<{ delivered: number }> {
    return this.tenantContext.runAsSystem(async () => {
      const rows = await this.notifications.dueForDelivery(now);
      for (const row of rows) {
        await this.dispatcher.deliverDeferred(row, now);
      }
      return { delivered: rows.length };
    });
  }

  runReminders(now = new Date()): Promise<RemindersResult> {
    return this.tenantContext.runAsSystem(() => this.reminders.run(now));
  }
}
