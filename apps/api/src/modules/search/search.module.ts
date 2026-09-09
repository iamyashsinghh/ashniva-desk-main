import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { BillingModule } from '../billing/billing.module';
import { ChangeRequestsModule } from '../change-requests/change-requests.module';
import { ContractsModule } from '../contracts/contracts.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { PortalModule } from '../portal/portal.module';
import { ProblemsModule } from '../problems/problems.module';
import { ProjectsModule } from '../projects/projects.module';
import { ReleasesModule } from '../releases/releases.module';
import { TasksModule } from '../tasks/tasks.module';
import { TicketsModule } from '../tickets/tickets.module';
import { UsersModule } from '../users/users.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * Global search: one endpoint that fans out to the list services of the modules the caller can
 * already list.
 *
 * It imports those modules and owns no data access of its own — no repository, no Prisma client —
 * which is the structural half of the guarantee that search cannot return more than a list does.
 * Nothing imports this module, so the fan-out cannot become a dependency of the modules it reads.
 */
@Module({
  imports: [
    TasksModule,
    TicketsModule,
    PortalModule,
    ProjectsModule,
    ContractsModule,
    BillingModule,
    ChangeRequestsModule,
    ProblemsModule,
    IncidentsModule,
    ApprovalsModule,
    ReleasesModule,
    UsersModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
