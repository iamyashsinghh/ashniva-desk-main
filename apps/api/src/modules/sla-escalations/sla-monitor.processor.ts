import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { QueueSchedulerRegistrar } from '../../infrastructure/queue/scheduled-jobs';
import { SlaMonitorService, type SlaMonitorResult } from './sla-monitor.service';

export const SLA_MONITOR_JOB = 'sla-monitor';
/** Every two minutes; the ticket projection covers the gap so nothing ever looks "on track" late. */
const SLA_MONITOR_CRON = '*/2 * * * *';

/** BullMQ side of the SLA monitor: a repeatable job that calls SlaMonitorService.run(). */
@Injectable()
@Processor(QUEUE_NAMES.SLA_MONITOR)
export class SlaMonitorProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.SLA_MONITOR) private readonly queue: Queue,
    private readonly monitor: SlaMonitorService,
    private readonly schedulers: QueueSchedulerRegistrar,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(SlaMonitorProcessor.name);
  }

  onModuleInit(): Promise<void> {
    return this.schedulers.register(this.queue, QUEUE_NAMES.SLA_MONITOR, [
      { id: SLA_MONITOR_JOB, pattern: SLA_MONITOR_CRON },
    ]);
  }

  async process(_job: Job): Promise<SlaMonitorResult> {
    const result = await this.monitor.run();
    if (result.warnings > 0 || result.breaches > 0) {
      this.logger.info(result, 'SLA monitor raised alerts');
    }
    return result;
  }
}
