import { Module } from '@nestjs/common';

import { SlaEscalationsModule } from '../sla-escalations/sla-escalations.module';
import { SupportTiersController } from './support-tiers.controller';
import { SupportTiersService } from './support-tiers.service';

/**
 * The administration surface for support tiers.
 *
 * Separate from `SupportTierPolicyModule`, which is global and read-only. This one imports the SLA
 * module so that changing which policy a tier selects reapplies the clocks of every open ticket,
 * exactly as `SlaPoliciesService` does after a policy edit. Putting that dependency behind the
 * global read module would have pulled the SLA module into every module in the application.
 */
@Module({
  imports: [SlaEscalationsModule],
  controllers: [SupportTiersController],
  providers: [SupportTiersService],
  exports: [SupportTiersService],
})
export class SupportTiersModule {}
