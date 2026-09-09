import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { ChangeRequestsModule } from '../change-requests/change-requests.module';
import { ClientUpdatesModule } from '../client-updates/client-updates.module';
import { ContractsModule } from '../contracts/contracts.module';
import { FilesModule } from '../files/files.module';
import { MilestonesModule } from '../milestones/milestones.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PortalController } from './portal.controller';
import { PortalPlanService } from './portal-plan.service';
import { PortalProgressRepository } from './portal-progress.repository';
import { PortalProgressService } from './portal-progress.service';
import { PortalTicketsService } from './portal-tickets.service';
import { PortalService } from './portal.service';

/** Client portal: overview, projects, project progress, published updates, tickets, files. */
@Module({
  imports: [
    ProjectsModule,
    TasksModule,
    ClientUpdatesModule,
    FilesModule,
    TicketsModule,
    MilestonesModule,
    ContractsModule,
    ApprovalsModule,
    ChangeRequestsModule,
  ],
  controllers: [PortalController],
  providers: [
    PortalService,
    PortalTicketsService,
    PortalProgressService,
    PortalProgressRepository,
    PortalPlanService,
  ],
  // Only the ticket service, and only so global search can reach a client's tickets through the
  // very service `GET /portal/tickets` uses. Nothing else here is exported: the portal's job is to
  // narrow, and a wider export would be a way around the narrowing.
  exports: [PortalTicketsService],
})
export class PortalModule {}
