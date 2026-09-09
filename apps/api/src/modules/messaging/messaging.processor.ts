import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { QueueSchedulerRegistrar } from '../../infrastructure/queue/scheduled-jobs';
import { MessageSenderService } from './message-sender.service';
import { MessagingRepository } from './messaging.repository';
import { SEND_JOB, type SendJobData } from './messaging.queue';

export const STALLED_SEND_SWEEP_JOB = 'stalled-send-sweep';

/** Every five minutes, so a stalled row is resolved within a threshold of going quiet. */
const SWEEP_CRON = '*/5 * * * *';

/**
 * How long a claim may stay unanswered before it is treated as abandoned.
 *
 * Comfortably longer than the slowest legitimate send. An SMTP server that greylists, or a
 * WhatsApp API under a throttle, can hold a connection for minutes; failing a message that is
 * still genuinely in flight would record a delivery that did happen as one that did not, and
 * would race a `markSent` about to land.
 */
export const STALLED_AFTER_MS = 15 * 60_000;

const STALLED_REASON =
  'The worker sending this message stopped before reporting back. ' +
  'Whether the provider accepted it is unknown, so it was not retried.';

/**
 * Sends queued email and WhatsApp messages, and closes claims nothing came back from.
 *
 * There is no deferral sweep here on purpose: quiet hours belong to the notification layer,
 * which holds the whole notification and sends its email or WhatsApp when it finally delivers.
 * Duplicating that here would give the same message two independent schedules.
 *
 * Runs as the system actor — one worker serves every tenant, and each send is scoped by the
 * organization on the job it is working from. The sweep is deliberately not scoped that way: it
 * matches on status and age alone, writes no tenant data, and moves nothing between tenants.
 *
 * One at a time, like every other worker, and that is a decision rather than a default. Two
 * separate reasons to leave it there for now:
 *
 * - The pool. Ten queues at a concurrency of one already reach `DB_POOL_MAX`'s default of ten,
 *   shared with the HTTP server, so background work can hold every connection and requests then
 *   fail at `DB_POOL_ACQUIRE_TIMEOUT_MS`. Raising any queue means raising the pool in the same
 *   change and saying what the new aggregate is — see `worker-concurrency.spec.ts`.
 * - Ordering. `NotificationsProcessor` delivers serially precisely so a recipient's messages do
 *   not reorder, and this queue is where those deliveries become actual email and WhatsApp. Two
 *   sends in flight for one recipient arrive in whatever order two providers answer in. The claim
 *   each job takes stops two workers sending the *same* message; it says nothing about the order
 *   of two different ones.
 *
 * The cost is real — a greylisting mail server holds up everyone else's mail behind it — and the
 * fix for it is a per-recipient or per-tenant key, not a bigger number. That is a change with its
 * own argument to make, not a line in a shutdown commit.
 */
@Injectable()
@Processor(QUEUE_NAMES.MESSAGING)
export class MessagingProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.MESSAGING) private readonly queue: Queue,
    private readonly sender: MessageSenderService,
    private readonly repository: MessagingRepository,
    private readonly tenantContext: TenantContextService,
    private readonly schedulers: QueueSchedulerRegistrar,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(MessagingProcessor.name);
  }

  onModuleInit(): Promise<void> {
    return this.schedulers.register(this.queue, QUEUE_NAMES.MESSAGING, [
      {
        id: STALLED_SEND_SWEEP_JOB,
        pattern: SWEEP_CRON,
        // No retries. The next run is five minutes away and does the same work, so a blip
        // costs one cycle rather than piling duplicate sweeps onto a recovering database.
        jobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
      },
    ]);
  }

  async process(job: Job<SendJobData>): Promise<{ status: string }> {
    if (job.name === STALLED_SEND_SWEEP_JOB) {
      const failed = await this.sweepStalledClaims();
      return { status: `swept ${failed}` };
    }
    if (job.name !== SEND_JOB) {
      this.logger.warn({ jobName: job.name }, 'Ignoring an unknown job on the messaging queue');
      return { status: 'ignored' };
    }

    const { messageId, request } = job.data;
    return this.tenantContext.runAsSystem(async () => {
      const { retry } = await this.sender.deliver(messageId, request);
      if (retry) {
        // Thrown so BullMQ applies the configured backoff. `deliver` has already recorded the
        // attempt and the reason, so nothing is lost when this is the last one.
        throw new Error(`Delivery failed for ${request.channel}; retrying`);
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
        // Worth a line in the log: a worker died mid-send, which is not routine.
        this.logger.warn({ failed }, 'Failed outbound messages whose worker never reported back');
      }
      return failed;
    });
  }
}
