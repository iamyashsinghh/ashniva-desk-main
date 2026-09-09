import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CONTRACT_STATUS } from '@ashniva/types';
import type { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { QueueSchedulerRegistrar } from '../../infrastructure/queue/scheduled-jobs';
import { ContractsRepository } from './contracts.repository';
import { HourLedgerService } from './hour-ledger.service';

export const CONTRACT_DAILY_JOB = 'contract-daily';
/** 00:30 IST every day (19:00 UTC the day before). */
const CONTRACT_DAILY_CRON = '0 19 * * *';

export interface ContractDailyResult {
  expired: number;
  periodsOpened: number;
}

/**
 * Daily contract housekeeping: active contracts past their end date become EXPIRED, and every
 * hour-tracking contract gets its current billing period opened (closing the previous one with
 * carry-forward or expiry). Renewal / expiry / low-hours notifications hang off the same job
 * through the notifications module.
 */
@Injectable()
@Processor(QUEUE_NAMES.CONTRACTS)
export class ContractsProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.CONTRACTS) private readonly queue: Queue,
    private readonly contracts: ContractsRepository,
    private readonly ledger: HourLedgerService,
    private readonly schedulers: QueueSchedulerRegistrar,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(ContractsProcessor.name);
  }

  onModuleInit(): Promise<void> {
    return this.schedulers.register(this.queue, QUEUE_NAMES.CONTRACTS, [
      { id: CONTRACT_DAILY_JOB, pattern: CONTRACT_DAILY_CRON },
    ]);
  }

  async process(_job: Job): Promise<ContractDailyResult> {
    return this.runDaily();
  }

  /** Exposed so tests and an operator endpoint can run the same logic on demand. */
  async runDaily(now = new Date()): Promise<ContractDailyResult> {
    const expiredRows = await this.contracts.listExpired(now);
    for (const row of expiredRows) {
      await this.contracts.update(row.id, { status: CONTRACT_STATUS.EXPIRED });
    }
    const periodsOpened = await this.ledger.rolloverAll(now);
    const result = { expired: expiredRows.length, periodsOpened };
    this.logger.info(result, 'Contract daily job finished');
    return result;
  }
}
