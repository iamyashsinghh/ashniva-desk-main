import { Module } from '@nestjs/common';

import { EmergencyFixService } from './emergency-fix.service';
import { IncidentActionsService } from './incident-actions.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

/**
 * Incidents: the urgent end of the problem-management chain — something is broken right now.
 *
 * Everything an incident records is internal, and the module deliberately exports only its
 * repository and mapper shapes. What a client may be told is one field a person writes and a
 * person publishes; there is no portal service here to build a client view out of.
 */
@Module({
  controllers: [IncidentsController],
  providers: [IncidentsRepository, IncidentsService, IncidentActionsService, EmergencyFixService],
  exports: [IncidentsRepository, IncidentsService],
})
export class IncidentsModule {}
