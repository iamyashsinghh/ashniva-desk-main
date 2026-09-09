import { Module } from '@nestjs/common';

import { ClientUpdatesModule } from '../client-updates/client-updates.module';
import { OrganizationMembershipsModule } from '../organization-memberships/organization-memberships.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';
import { TaskVisibilityModule } from '../tasks/task-visibility.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

/** Role-specific dashboards computed live from tasks, tickets, work logs and client updates. */
@Module({
  imports: [
    ProjectsModule,
    ClientUpdatesModule,
    OrganizationsModule,
    OrganizationMembershipsModule,
    TaskVisibilityModule,
  ],
  controllers: [DashboardsController],
  providers: [DashboardsService],
})
export class DashboardsModule {}
