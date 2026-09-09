import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { RETRY_POLICY } from '../integrations/integration-retry';

export const DELIVER_JOB = 'deliver-callback';

export interface DeliverJobData {
  organizationId: string;
  deliveryId: string;
}

@Injectable()
export class SupportCallbacksQueue {
  constructor(@InjectQueue(QUEUE_NAMES.SUPPORT_CALLBACKS) private readonly queue: Queue) {}

  /**
   * Queues one delivery.
   *
   * The job id is the delivery row's id, so a caller that queues the same claimed delivery twice
   * gets one job. Attempts and backoff come from `RETRY_POLICY` rather than from numbers written
   * here, so the queue's own retries and the sender's accounting cannot disagree about how many
   * tries a delivery gets.
   *
   * @param nonce distinguishes a deliberate redelivery from the original. BullMQ refuses a job
   * whose id already exists — including one that has completed and not yet been trimmed — so
   * without this an operator's "redeliver" on a recently sent callback would silently do nothing.
   * The row's own status guard, not the job id, is what keeps a redelivery from double-sending.
   */
  async enqueue(data: DeliverJobData, nonce?: string): Promise<void> {
    await this.queue.add(DELIVER_JOB, data, {
      jobId: nonce ? `callback-${data.deliveryId}-${nonce}` : `callback-${data.deliveryId}`,
      attempts: RETRY_POLICY.maxAttempts,
      backoff: { type: 'exponential', delay: RETRY_POLICY.baseDelayMs },
      removeOnComplete: 500,
      removeOnFail: 1_000,
    });
  }
}
