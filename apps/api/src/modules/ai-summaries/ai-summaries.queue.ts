import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { AuthenticatedUser } from '@ashniva/types';

import { AppConfigService } from '../../config/app-config.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';

export const GENERATE_SUMMARY_JOB = 'generate-summary';

/**
 * The job payload.
 *
 * It carries the actor's id, organization and permissions rather than a token, so the worker
 * re-runs the same checks the request would have. Nothing here is a secret — the provider
 * credential is read from the encrypted connection inside the worker, never carried in a job.
 */
export interface GenerateSummaryJobData {
  summaryId: string;
  actor: Pick<
    AuthenticatedUser,
    'userId' | 'organizationId' | 'roleKey' | 'permissions' | 'isServiceProvider'
  >;
}

@Injectable()
export class AiSummariesQueue {
  constructor(
    @InjectQueue(QUEUE_NAMES.AI_SUMMARIES) private readonly queue: Queue,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Queues a generation run.
   *
   * The job id is derived from the summary, so two clicks on "generate" collapse into one queued
   * job rather than racing. A hyphen, not a colon: BullMQ rejects a custom id containing one.
   *
   * That is only the first line of defence. The worker also claims the summary with a conditional
   * update, so even a duplicate job that does get through finds the row already claimed and stops.
   */
  async enqueueGeneration(actor: AuthenticatedUser, summaryId: string): Promise<void> {
    const data: GenerateSummaryJobData = {
      summaryId,
      actor: {
        userId: actor.userId,
        organizationId: actor.organizationId,
        roleKey: actor.roleKey,
        permissions: actor.permissions,
        isServiceProvider: actor.isServiceProvider,
      },
    };

    await this.queue.add(GENERATE_SUMMARY_JOB, data, {
      jobId: `ai-summary-${summaryId}`,
      attempts: this.config.ai.maxAttempts,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }
}
