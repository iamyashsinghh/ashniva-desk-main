import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { MilestonesModule } from '../milestones/milestones.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ContractsController } from './contracts.controller';
import { ContractsProcessor } from './contracts.processor';
import { ContractsRepository } from './contracts.repository';
import { ContractsService } from './contracts.service';
import { HourBalanceReader } from './hour-balance-reader.service';
import { HourLedgerService } from './hour-ledger.service';
import { PaymentMilestonesService } from './payment-milestones.service';
import { PortalContractsController } from './portal-contracts.controller';
import { PortalContractsService } from './portal-contracts.service';

/**
 * Contracts (fixed price, retainer, AMC, support hours, dedicated developer), the support-hour
 * ledger with billing periods and carry-forward, payment milestones, documents and the daily
 * expiry / period job. Client portal endpoints live here too, built from allow-list mappers.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.CONTRACTS }),
    MilestonesModule,
    OrganizationsModule,
  ],
  controllers: [ContractsController, PortalContractsController],
  providers: [
    ContractsRepository,
    HourBalanceReader,
    HourLedgerService,
    ContractsService,
    PaymentMilestonesService,
    PortalContractsService,
    ContractsProcessor,
  ],
  exports: [
    ContractsRepository,
    HourBalanceReader,
    HourLedgerService,
    ContractsService,
    PortalContractsService,
  ],
})
export class ContractsModule {}
