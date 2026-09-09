import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { MilestonesModule } from '../milestones/milestones.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TasksModule } from '../tasks/tasks.module';
import { ChangeRequestScopeService } from './change-request-scope.service';
import { ChangeRequestTasksService } from './change-request-tasks.service';
import { ChangeRequestTransitionsService } from './change-request-transitions.service';
import { ChangeRequestsController } from './change-requests.controller';
import { ChangeRequestsRepository } from './change-requests.repository';
import { ChangeRequestsService } from './change-requests.service';
import { PortalChangeRequestsController } from './portal-change-requests.controller';

/**
 * Change requests: Draft → Submitted → Internal review → Client review → Approved → Scheduled →
 * Completed (plus Rejected, Changes requested, Cancelled). Client review runs through the
 * approvals module; approved requests generate linked tasks and milestones.
 */
@Module({
  imports: [
    ApprovalsModule,
    TasksModule,
    MilestonesModule,
    OrganizationsModule,
    NotificationsModule,
  ],
  controllers: [ChangeRequestsController, PortalChangeRequestsController],
  providers: [
    ChangeRequestsRepository,
    ChangeRequestScopeService,
    ChangeRequestsService,
    ChangeRequestTransitionsService,
    ChangeRequestTasksService,
  ],
  exports: [ChangeRequestsRepository, ChangeRequestsService],
})
export class ChangeRequestsModule {}
