import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { IntegrationsModule } from '../integrations/integrations.module';
import { IvrModule } from '../ivr/ivr.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketRoutingModule } from '../ticket-routing/ticket-routing.module';
import { TicketsModule } from '../tickets/tickets.module';
import { CallEventsService } from './call-events.service';
import { InternalCallAdvancerRegistry } from './internal-call-advancer';
import { CallMonitorProcessor } from './call-monitor.processor';
import { CallLogsRepository } from './call-logs.repository';
import { CallNotificationsService } from './call-notifications.service';
import { CallPlacementService } from './call-placement.service';
import { CallRecordingService } from './call-recording.service';
import { CallRoutingService } from './call-routing.service';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { IvrWebhookService } from './ivr-webhook.service';
import { IvrWebhooksController } from './ivr-webhooks.controller';

/**
 * Support calls: who they reach, what happened, and who may listen afterwards.
 *
 * Imports the IVR module for the adapter and the product policy, and the routing module for the
 * candidates and the availability resolver. It contributes no routing rules of its own — package
 * 8b decides who is eligible, here and everywhere else.
 *
 * The webhook controller lives here rather than in `ivr` because applying a provider event means
 * writing a call record, and putting it the other way round would make the two modules import
 * each other. `ivr` stays a leaf; this module is where telephony meets tickets.
 */
@Module({
  imports: [
    IvrModule,
    TicketsModule,
    TicketRoutingModule,
    NotificationsModule,
    IntegrationsModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.IVR_EVENTS }),
  ],
  controllers: [CallsController, IvrWebhooksController],
  providers: [
    CallLogsRepository,
    CallRoutingService,
    CallNotificationsService,
    CallPlacementService,
    CallRecordingService,
    CallEventsService,
    CallsService,
    IvrWebhookService,
    CallMonitorProcessor,
    InternalCallAdvancerRegistry,
  ],
  exports: [
    // Exported for package 9b: an internal chat that offers "call this person about the ticket"
    // asks for a call the same way the ticket screen does, and gets the same routing, the same
    // fallback ladder and the same audit trail. There is no second way to place a call.
    CallsService,
    CallPlacementService,
    CallLogsRepository,
    CallRecordingService,
    CallNotificationsService,
    // Package 9b registers its internal-call handler here at start-up. See
    // `internal-call-advancer.ts` for why the seam points this way.
    InternalCallAdvancerRegistry,
  ],
})
export class CallLogsModule {}
