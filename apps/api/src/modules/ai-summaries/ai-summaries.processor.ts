import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import type { AuthenticatedUser } from '@ashniva/types';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { redactMessage } from '../integrations/redact';
import { AiSummariesService } from './ai-summaries.service';
import { GENERATE_SUMMARY_JOB, type GenerateSummaryJobData } from './ai-summaries.queue';

/**
 * Background generation.
 *
 * The job runs inside the tenant context of the person who asked for it, not as a system actor:
 * generation reads tasks, tickets and work logs, and it must see exactly what that request would
 * have seen. A job whose payload names another organization therefore finds nothing.
 *
 * Only a retryable failure is re-thrown. Re-throwing everything would spend the configured
 * attempts on a rejected credential or an unparseable response, neither of which improves by
 * being tried again — and each attempt is a paid call.
 *
 * One at a time: the aggregate of every queue's concurrency is charged to one `DB_POOL_MAX`,
 * which the HTTP server shares, and ten queues at one apiece already reach its default of ten.
 * See `worker-concurrency.spec.ts` for the cross-check.
 */
@Injectable()
@Processor(QUEUE_NAMES.AI_SUMMARIES)
export class AiSummariesProcessor extends WorkerHost {
  constructor(
    private readonly summaries: AiSummariesService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(AiSummariesProcessor.name);
  }

  async process(job: Job<GenerateSummaryJobData>): Promise<{ status: string }> {
    if (job.name !== GENERATE_SUMMARY_JOB) {
      return { status: 'ignored' };
    }
    const { summaryId, actor } = job.data;

    return this.tenantContext.run(
      { organizationId: actor.organizationId, userId: actor.userId },
      async () => {
        try {
          const outcome = await this.summaries.generate(
            actor as AuthenticatedUser,
            summaryId,
            job.attemptsMade + 1,
          );
          if (outcome.ok) {
            return { status: 'generated' };
          }
          if (outcome.retryable) {
            // Re-thrown so BullMQ applies the backoff. The run is already recorded, and the next
            // attempt re-claims the summary, so a retry cannot double up.
            throw new Error(outcome.message ?? 'The AI provider could not be reached');
          }
          this.logger.warn({ summaryId, status: outcome.status }, 'AI generation did not succeed');
          return { status: outcome.status.toLowerCase() };
        } catch (error) {
          const message = redactMessage(error);
          this.logger.warn({ summaryId, message }, 'AI generation job failed');
          throw new Error(message);
        }
      },
    );
  }
}
