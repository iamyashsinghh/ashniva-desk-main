import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ApprovalSubjectsService } from './approval-subjects.service';
import { ApprovalTransitionsService } from './approval-transitions.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsRepository } from './approvals.repository';
import { ApprovalsService } from './approvals.service';
import { PortalApprovalsController } from './portal-approvals.controller';

/**
 * Client approvals for work updates, milestones, contract documents, change requests and files:
 * Draft → Internal review → Published to client → Client approved / Changes requested /
 * Rejected / Withdrawn. Distinct from the Theme Manager's publishing approvals. Modules that own
 * a subject type register a decision handler on ApprovalTransitionsService.
 */
@Module({
  imports: [OrganizationsModule, NotificationsModule],
  controllers: [ApprovalsController, PortalApprovalsController],
  providers: [
    ApprovalsRepository,
    ApprovalSubjectsService,
    ApprovalsService,
    ApprovalTransitionsService,
  ],
  exports: [ApprovalsRepository, ApprovalsService, ApprovalTransitionsService],
})
export class ApprovalsModule {}
