import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { MAX_ATTEMPTS, type SendRequest } from './message-sender.service';

export const SEND_JOB = 'send-message';

export interface SendJobData {
  messageId: string;
  request: SendRequest;
}

@Injectable()
export class MessagingQueue {
  constructor(@InjectQueue(QUEUE_NAMES.MESSAGING) private readonly queue: Queue) {}

  /**
   * Queues one send.
   *
   * The job id is the message row's id, so a caller that queues the same claimed message twice
   * gets one job. Retries are exponential from 10 seconds: a greylisting server or a throttled
   * API needs time, and hammering it makes the throttle worse.
   */
  async enqueueSend(data: SendJobData, delayMs = 0): Promise<void> {
    await this.queue.add(SEND_JOB, data, {
      jobId: `send-${data.messageId}`,
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: 10_000 },
      ...(delayMs > 0 ? { delay: delayMs } : {}),
      removeOnComplete: 500,
      removeOnFail: 1_000,
    });
  }
}
