import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';

import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SlaEscalationsModule } from '../sla-escalations/sla-escalations.module';
import { SupportCallbacksModule } from '../support-callbacks/support-callbacks.module';
import { TasksModule } from '../tasks/tasks.module';
import { TicketEventsService } from './ticket-events.service';
import { TicketTransitionsService } from './ticket-transitions.service';
import { TicketsController } from './tickets.controller';
import { TicketsRepository } from './tickets.repository';
import { TicketsService } from './tickets.service';

/**
 * Tickets and the Phase 1 workflow (ticket-workflow.ts): raise, assign, start, wait for client,
 * review, resolve, close, reopen, cancel, public replies / internal notes, ticket → tasks.
 */
@Module({
  imports: [
    OrganizationsModule,
    TasksModule,
    SlaEscalationsModule,
    NotificationsModule,
    SupportCallbacksModule,
    // The queue only — not the routing module, which imports this one. Raising a ticket asks for
    // routing by posting a job; it never calls the router, so the two modules stay acyclic.
    BullModule.registerQueue({ name: QUEUE_NAMES.ROUTING_MONITOR }),
  ],
  controllers: [TicketsController],
  providers: [TicketsRepository, TicketsService, TicketEventsService, TicketTransitionsService],
  exports: [TicketsRepository, TicketsService, TicketTransitionsService],
})
export class TicketsModule {}
