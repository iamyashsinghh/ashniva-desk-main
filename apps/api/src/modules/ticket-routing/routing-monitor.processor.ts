import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { QueueSchedulerRegistrar } from '../../infrastructure/queue/scheduled-jobs';
import { RoutingMonitorService, type RoutingMonitorResult } from './routing-monitor.service';
import { TicketRoutingService } from './ticket-routing.service';

export const ROUTING_MONITOR_JOB = 'routing-monitor';
/**
 * One ticket, routed once, off the request that raised it.
 *
 * Routing reads five tables and dispatches notifications. Doing that inside `POST /tickets` would
 * put all of it into the latency a client sees when they report a problem, and would mean a
 * router that failed took the ticket down with it. Raising the ticket and placing it are two
 * different jobs, and the ticket exists either way.
 */
export const ROUTE_TICKET_JOB = 'route-ticket';

export interface RouteTicketJob {
  organizationId: string;
  ticketId: string;
}
/**
 * Every minute. The acknowledgement window is measured in minutes — fifteen by default — so a
 * coarser sweep would make the effective deadline noticeably later than the one configured.
 */
const ROUTING_MONITOR_CRON = '* * * * *';

/** BullMQ side of the routing timers: a repeatable job that calls RoutingMonitorService.run(). */
@Injectable()
@Processor(QUEUE_NAMES.ROUTING_MONITOR)
export class RoutingMonitorProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.ROUTING_MONITOR) private readonly queue: Queue,
    private readonly monitor: RoutingMonitorService,
    private readonly routing: TicketRoutingService,
    private readonly tenantContext: TenantContextService,
    private readonly schedulers: QueueSchedulerRegistrar,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(RoutingMonitorProcessor.name);
  }

  // A missing scheduler is not a reason to refuse to boot: routing still works, and the timers
  // can be swept by hand until Redis is back. The registrar retries; readiness reports it.
  onModuleInit(): Promise<void> {
    return this.schedulers.register(this.queue, QUEUE_NAMES.ROUTING_MONITOR, [
      { id: ROUTING_MONITOR_JOB, pattern: ROUTING_MONITOR_CRON },
    ]);
  }

  async process(job: Job): Promise<RoutingMonitorResult | { routed: boolean }> {
    if (job.name === ROUTE_TICKET_JOB) {
      const { organizationId, ticketId } = job.data as RouteTicketJob;
      // As the system: the job carries no session, and the routing tables' policies pass when
      // there is no tenant precisely so background work can reach them.
      const result = await this.tenantContext.runAsSystem(() =>
        this.routing.route(organizationId, ticketId),
      );
      return { routed: result.applied };
    }

    const result = await this.monitor.run();
    if (result.acknowledgementsOverdue > 0 || result.escalated > 0) {
      this.logger.info(result, 'Routing monitor acted on overdue tickets');
    }
    return result;
  }
}
