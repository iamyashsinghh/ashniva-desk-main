import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { redactMessage } from '../integrations/redact';
import { GENERATE_JOB, type GenerateJobData } from './release-notes.queue';
import { ReleaseNotesService } from './release-notes.service';

/**
 * Background draft generation.
 *
 * The job runs inside the tenant context of the person who asked for it, not as a system actor:
 * generation reads tasks, tickets and updates, and it must see exactly what that request would
 * have seen. A job whose payload names another organization therefore finds nothing.
 *
 * One at a time, for the reason the AI summaries queue gives: the aggregate of every queue's
 * concurrency is charged to one `DB_POOL_MAX`, which the HTTP server shares.
 */
@Injectable()
@Processor(QUEUE_NAMES.RELEASE_NOTES)
export class ReleaseNotesProcessor extends WorkerHost {
  constructor(
    private readonly releaseNotes: ReleaseNotesService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(ReleaseNotesProcessor.name);
  }

  async process(job: Job<GenerateJobData>): Promise<{ status: string }> {
    if (job.name !== GENERATE_JOB) {
      return { status: 'ignored' };
    }
    const { releaseNoteId, actor, options } = job.data;

    return this.tenantContext.run(
      { organizationId: actor.organizationId, userId: actor.userId },
      async () => {
        try {
          await this.releaseNotes.generate(actor, releaseNoteId, options);
          return { status: 'generated' };
        } catch (error) {
          const message = redactMessage(error);
          this.logger.warn({ releaseNoteId, message }, 'Release-note generation failed');
          // Re-thrown so BullMQ applies the configured retry and backoff. Generation is
          // idempotent, so a retry cannot double up items.
          throw new Error(message);
        }
      },
    );
  }
}
