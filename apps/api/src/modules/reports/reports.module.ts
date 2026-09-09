import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { OrganizationsModule } from '../organizations/organizations.module';
import { WorkLogsModule } from '../work-logs/work-logs.module';
import { WorkLogsService } from '../work-logs/work-logs.service';
import {
  AdvancedReportsController,
  PortalReportsController,
} from './advanced/advanced-reports.controller';
import { AdvancedReportsService } from './advanced/advanced-reports.service';
import { DailyReportsProcessor } from './daily-reports.processor';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Automatic daily reports (live per person / team, stored snapshots, nightly job) and the
 * Phase 2 advanced reports with CSV export, for staff and for the client portal.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.DAILY_REPORTS }),
    WorkLogsModule,
    OrganizationsModule,
  ],
  controllers: [ReportsController, AdvancedReportsController, PortalReportsController],
  providers: [ReportsService, WorkLogsService, DailyReportsProcessor, AdvancedReportsService],
})
export class ReportsModule {}
