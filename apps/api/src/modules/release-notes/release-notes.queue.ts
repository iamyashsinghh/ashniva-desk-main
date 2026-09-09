import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { AuthenticatedUser } from '@ashniva/types';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import type { GenerateOptions } from './release-note-generator.service';

export const GENERATE_JOB = 'generate-draft';

/**
 * The job payload.
 *
 * It carries the actor's id, organization and permissions rather than a token, so the worker can
 * re-run the same permission checks the request would have. Nothing here is a secret.
 */
export interface GenerateJobData {
  releaseNoteId: string;
  actor: Pick<
    AuthenticatedUser,
    'userId' | 'organizationId' | 'roleKey' | 'permissions' | 'isServiceProvider'
  >;
  options: GenerateOptions;
}

@Injectable()
export class ReleaseNotesQueue {
  constructor(@InjectQueue(QUEUE_NAMES.RELEASE_NOTES) private readonly queue: Queue) {}

  /**
   * Queues a generation run.
   *
   * The job id is the release note's id, so two clicks on "generate" collapse into one queued
   * job rather than racing each other. Generation is additive and de-duplicates by item
   * identity, so a job that does run twice still produces the same document.
   */
  async enqueueGeneration(
    actor: AuthenticatedUser,
    releaseNoteId: string,
    options: GenerateOptions,
  ): Promise<void> {
    const data: GenerateJobData = {
      releaseNoteId,
      actor: {
        userId: actor.userId,
        organizationId: actor.organizationId,
        roleKey: actor.roleKey,
        permissions: actor.permissions,
        isServiceProvider: actor.isServiceProvider,
      },
      options,
    };

    await this.queue.add(GENERATE_JOB, data, {
      jobId: `generate-${releaseNoteId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }
}
