import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { NotificationsModule } from '../notifications/notifications.module';
import { OnCallModule } from '../on-call/on-call.module';
import { TicketsModule } from '../tickets/tickets.module';
import { RoutingCandidatesService } from './routing-candidates.service';
import { RoutingEscalationService } from './routing-escalation.service';
import { RoutingMonitorProcessor } from './routing-monitor.processor';
import { RoutingMonitorService } from './routing-monitor.service';
import { RoutingNotificationsService } from './routing-notifications.service';
import { RoutingQueryService } from './routing-query.service';
import { TicketRoutingController } from './ticket-routing.controller';
import { TicketRoutingRepository } from './ticket-routing.repository';
import { TicketRoutingService } from './ticket-routing.service';

/**
 * Automatic routing of support tickets to the responsible or on-call developer, the
 * acknowledgement and escalation timers, and the decision trail that explains all of it.
 *
 * Reads what package 8a configures (via `OnCallModule`) and never writes it. The router itself is
 * exported so that later packages — the support ingress of 8c and the IVR of package 9 — can ask
 * for a routing decision without reaching into any of this.
 */
@Module({
  imports: [
    TicketsModule,
    OnCallModule,
    NotificationsModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.ROUTING_MONITOR }),
  ],
  controllers: [TicketRoutingController],
  providers: [
    TicketRoutingRepository,
    RoutingCandidatesService,
    RoutingNotificationsService,
    TicketRoutingService,
    RoutingEscalationService,
    RoutingQueryService,
    RoutingMonitorService,
    RoutingMonitorProcessor,
  ],
  exports: [
    TicketRoutingService,
    RoutingEscalationService,
    RoutingMonitorService,
    // Package 9 rings the ticket's owner first and then asks routing who is next. It needs the
    // candidates and the availability resolver, not a routing decision of its own.
    RoutingCandidatesService,
    TicketRoutingRepository,
  ],
})
export class TicketRoutingModule {}
