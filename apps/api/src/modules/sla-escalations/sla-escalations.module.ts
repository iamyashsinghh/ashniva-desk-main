import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SlaController } from './sla.controller';
import { SlaMonitorProcessor } from './sla-monitor.processor';
import { SlaMonitorService } from './sla-monitor.service';
import { SlaPoliciesRepository } from './sla-policies.repository';
import { SlaPoliciesService } from './sla-policies.service';
import { SlaTransitionsService } from './sla-transitions.service';
import { TicketSlaService } from './ticket-sla.service';

/**
 * SLA policies (business hours, timezone, per-priority targets, pause statuses, warning
 * threshold), the per-ticket clocks and event history, and the BullMQ monitor that raises
 * warnings and breaches. Escalation levels and on-call are later phases.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.SLA_MONITOR }),
    OrganizationsModule,
    NotificationsModule,
  ],
  controllers: [SlaController],
  providers: [
    SlaPoliciesRepository,
    SlaTransitionsService,
    TicketSlaService,
    SlaPoliciesService,
    SlaMonitorService,
    SlaMonitorProcessor,
  ],
  exports: [TicketSlaService, SlaMonitorService, SlaPoliciesRepository],
})
export class SlaEscalationsModule {}
