import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CALL_STATUS } from '@ashniva/types';
import type { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { QueueSchedulerRegistrar } from '../../infrastructure/queue/scheduled-jobs';
import { CallPlacementService } from './call-placement.service';

export const CALL_MONITOR_JOB = 'call-monitor';

/**
 * Every minute, because a telephone ringing is measured in seconds and a caller waiting for a
 * call back notices minutes.
 */
const CALL_MONITOR_CRON = '* * * * *';

/**
 * How long a call may sit unanswered with nothing heard from the provider before Desk stops
 * waiting and moves on. Long enough for a real ring; short enough that somebody who picked up the
 * phone is not left listening to nothing.
 */
const STALE_AFTER_MS = 3 * 60 * 1000;

/** One sweep never touches more than this, so a backlog is worked through rather than swallowed. */
const BATCH = 50;

/**
 * The calls nobody ever told us about.
 *
 * Every other path through package 9 is driven by a provider event: the call rings, somebody
 * answers, it ends, and the ladder moves on. This is the path for when no event ever arrives —
 * the provider dropped the callback, the network ate it, the account was misconfigured. Without
 * it such a call sits at `RINGING` forever, which is precisely the silent drop this package
 * exists to prevent: nobody is on the phone, nobody is told, and nothing in Desk says so.
 *
 * The sweep does not decide anything itself. It asks the placement service to advance the call,
 * which either rings the next destination or ends the call with a stated reason and notifies the
 * support queue — the same two outcomes a real `no_answer` event produces.
 */
@Injectable()
@Processor(QUEUE_NAMES.IVR_EVENTS)
export class CallMonitorProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.IVR_EVENTS) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly placement: CallPlacementService,
    private readonly tenantContext: TenantContextService,
    private readonly schedulers: QueueSchedulerRegistrar,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(CallMonitorProcessor.name);
  }

  // A missing scheduler is not a reason to refuse to boot: calls still place and still follow
  // provider events, and the stragglers can be swept by hand until Redis is back. The registrar
  // keeps retrying and the readiness probe says so meanwhile.
  onModuleInit(): Promise<void> {
    return this.schedulers.register(this.queue, QUEUE_NAMES.IVR_EVENTS, [
      { id: CALL_MONITOR_JOB, pattern: CALL_MONITOR_CRON },
    ]);
  }

  async process(_job: Job): Promise<{ swept: number }> {
    return this.tenantContext.runAsSystem(() => this.sweep());
  }

  private async sweep(now = new Date()): Promise<{ swept: number }> {
    const stale = await this.prisma.callLog.findMany({
      where: {
        status: { in: [CALL_STATUS.REQUESTED, CALL_STATUS.RINGING] },
        updatedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) },
      },
      select: { id: true, organizationId: true },
      orderBy: { requestedAt: 'asc' },
      take: BATCH,
    });

    let swept = 0;
    for (const call of stale) {
      try {
        // Each call in its own try/catch: one tenant with a broken IVR configuration must not
        // stop the sweep reaching the next one.
        await this.placement.advance(call.organizationId, call.id, now);
        swept += 1;
      } catch (error) {
        this.logger.warn({ err: error, callId: call.id }, 'Call sweep failed');
      }
    }
    if (swept > 0) {
      this.logger.info({ swept }, 'Advanced calls the provider never reported on');
    }
    return { swept };
  }
}
