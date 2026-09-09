import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { CallbackSenderService } from './callback-sender.service';
import { SupportCallbacksRepository } from './support-callbacks.repository';
import { DELIVER_JOB, type DeliverJobData } from './support-callbacks.queue';

export const STALLED_CALLBACK_SWEEP_JOB = 'stalled-callback-sweep';

/** Every five minutes, so a stalled row is resolved within a threshold of going quiet. */
const SWEEP_CRON = '*/5 * * * *';

/**
 * How long a claim may stay unanswered before it is treated as abandoned.
 *
 * Comfortably longer than the slowest legitimate delivery, which is bounded by the transport's own
 * ten-second timeout. Failing a delivery that is still genuinely in flight would record a callback
 * that did arrive as one that did not, and would race a `markSent` about to land.
 */
export const STALLED_AFTER_MS = 15 * 60_000;

const STALLED_REASON =
  'The worker delivering this callback stopped before reporting back. ' +
  'Whether the endpoint received it is unknown, so it was not retried.';

/**
 * Delivers queued callbacks, and closes claims nothing came back from.
 *
 * Runs as the system actor — one worker serves every tenant, and each delivery is scoped by the
 * organization on the job it is working from. The sweep is deliberately not scoped that way: it
 * matches on status and age alone, writes no tenant data, and moves nothing between tenants.
 */
@Injectable()
@Processor(QUEUE_NAMES.SUPPORT_CALLBACKS)
export class SupportCallbacksProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.SUPPORT_CALLBACKS) private readonly queue: Queue,
    private readonly sender: CallbackSenderService,
    private readonly repository: SupportCallbacksRepository,
    private readonly tenantContext: TenantContextService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(SupportCallbacksProcessor.name);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        STALLED_CALLBACK_SWEEP_JOB,
        { pattern: SWEEP_CRON },
        {
          name: STALLED_CALLBACK_SWEEP_JOB,
          // No retries. The next run is five minutes away and does the same work, so a blip costs
          // one cycle rather than piling duplicate sweeps onto a recovering database.
          opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
        },
      );
    } catch (error) {
      // A missing schedule leaves stalled rows sitting; it must not stop the API booting.
      this.logger.warn({ err: error }, 'Could not schedule the stalled-callback sweep');
    }
  }

  async process(job: Job<DeliverJobData>): Promise<{ status: string }> {
    if (job.name === STALLED_CALLBACK_SWEEP_JOB) {
      return { status: `swept ${await this.sweepStalledClaims()}` };
    }
    if (job.name !== DELIVER_JOB) {
      this.logger.warn({ jobName: job.name }, 'Ignoring an unknown job on the callback queue');
      return { status: 'ignored' };
    }

    const { organizationId, deliveryId } = job.data;
    return this.tenantContext.runAsSystem(async () => {
      const { retry } = await this.sender.deliver(organizationId, deliveryId);
      if (retry) {
        // Thrown so BullMQ applies the configured backoff. `deliver` has already recorded the
        // attempt and the reason, so nothing is lost when this is the last one.
        throw new Error(`Callback ${deliveryId} was not accepted; retrying`);
      }
      return { status: 'settled' };
    });
  }

  /** Exposed for the tests, and so the sweep can be run by hand during an incident. */
  async sweepStalledClaims(now = new Date()): Promise<number> {
    return this.tenantContext.runAsSystem(async () => {
      const claimedBefore = new Date(now.getTime() - STALLED_AFTER_MS);
      const failed = await this.repository.failStalledClaims(claimedBefore, STALLED_REASON);
      if (failed > 0) {
        // Worth a line in the log: a worker died mid-delivery, which is not routine.
        this.logger.warn({ failed }, 'Failed callbacks whose worker never reported back');
      }
      return failed;
    });
  }
}
