import { Module } from '@nestjs/common';

import { SupportOwnershipController } from './support-ownership.controller';
import { SupportOwnershipRepository } from './support-ownership.repository';
import { SupportOwnershipService } from './support-ownership.service';

/**
 * On-call schedules per project, working hours, support ownership and developer availability.
 *
 * The three records this owns — rota, availability, on-call — are the inputs the routing engine of
 * package 8b reads. Nothing here routes anything; the service is exported so the router can ask it
 * who is available without going back to the database itself.
 */
@Module({
  controllers: [SupportOwnershipController],
  providers: [SupportOwnershipService, SupportOwnershipRepository],
  exports: [SupportOwnershipService, SupportOwnershipRepository],
})
export class OnCallModule {}
