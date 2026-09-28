import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { QueueSchedulerRegistrar } from '../../infrastructure/queue/scheduled-jobs';
import {
  WorkTimeMonitorService,
  type WorkTimeMonitorResult,
} from './work-time-monitor.service';

export const WORK_TIME_MONITOR_JOB = 'work-time-monitor';
/** Every two minutes — allotment overrun should reach PMs while the person is still working. */
const WORK_TIME_MONITOR_CRON = '*/2 * * * *';

@Injectable()
@Processor(QUEUE_NAMES.WORK_TIME_MONITOR)
export class WorkTimeMonitorProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.WORK_TIME_MONITOR) private readonly queue: Queue,
    private readonly monitor: WorkTimeMonitorService,
    private readonly schedulers: QueueSchedulerRegistrar,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(WorkTimeMonitorProcessor.name);
  }

  onModuleInit(): Promise<void> {
    return this.schedulers.register(this.queue, QUEUE_NAMES.WORK_TIME_MONITOR, [
      { id: WORK_TIME_MONITOR_JOB, pattern: WORK_TIME_MONITOR_CRON },
    ]);
  }

  async process(_job: Job): Promise<WorkTimeMonitorResult> {
    const result = await this.monitor.run();
    if (result.notified > 0) {
      this.logger.info(result, 'Work-time monitor raised overrun alerts');
    }
    return result;
  }
}
