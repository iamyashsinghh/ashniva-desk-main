import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { QueueSchedulerRegistrar } from '../../infrastructure/queue/scheduled-jobs';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { toReportDate } from './daily-report-builder';
import { ReportsService } from './reports.service';

export const DAILY_SNAPSHOT_JOB = 'daily-snapshot';
/** 18:30 IST every day (13:00 UTC) — the end of the working day the reports describe. */
const DAILY_SNAPSHOT_CRON = '0 13 * * *';

/**
 * Stores everyone's daily report at the end of the day so history survives later edits.
 * Reports are also refreshed live whenever work is submitted, approved or logged.
 */
@Injectable()
@Processor(QUEUE_NAMES.DAILY_REPORTS)
export class DailyReportsProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.DAILY_REPORTS) private readonly queue: Queue,
    private readonly reports: ReportsService,
    private readonly organizations: OrganizationsRepository,
    private readonly schedulers: QueueSchedulerRegistrar,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(DailyReportsProcessor.name);
  }

  // Redis being down must not stop the API; the readiness probe reports the missing scheduler.
  onModuleInit(): Promise<void> {
    return this.schedulers.register(this.queue, QUEUE_NAMES.DAILY_REPORTS, [
      { id: DAILY_SNAPSHOT_JOB, pattern: DAILY_SNAPSHOT_CRON },
    ]);
  }

  async process(job: Job<{ reportDate?: string }>): Promise<{ stored: number }> {
    const provider = await this.organizations.findServiceProvider();
    if (!provider) {
      return { stored: 0 };
    }
    const reportDate = job.data.reportDate ?? toReportDate(new Date());
    const stored = await this.reports.snapshotEveryone(provider.id, reportDate);
    this.logger.info({ reportDate, stored }, 'Daily report snapshots stored');
    return { stored };
  }
}
