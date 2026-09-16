import { Module } from '@nestjs/common';

import { ClientUpdatesModule } from '../client-updates/client-updates.module';
import { ContractsModule } from '../contracts/contracts.module';
import { MilestonesModule } from '../milestones/milestones.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { WorkLogsModule } from '../work-logs/work-logs.module';
import { CommentsRepository } from './comments.repository';
import { TaskEventsService } from './task-events.service';
import { TaskReviewService } from './task-review.service';
import { TaskTransitionsService } from './task-transitions.service';
import { TasksController } from './tasks.controller';
import { TaskVisibilityModule } from './task-visibility.module';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

/**
 * Tasks and the Phase 1 workflow (task-workflow.ts): create, assign, start, block, submit with
 * the completion sheet, review, reopen, cancel, comments and time logging.
 */
@Module({
  imports: [
    ProjectsModule,
    WorkLogsModule,
    ClientUpdatesModule,
    MilestonesModule,
    ContractsModule,
    NotificationsModule,
    TaskVisibilityModule,
  ],
  controllers: [TasksController],
  providers: [
    TasksRepository,
    CommentsRepository,
    TasksService,
    TaskEventsService,
    TaskTransitionsService,
    TaskReviewService,
  ],
  exports: [
    TasksRepository,
    CommentsRepository,
    TasksService,
    TaskEventsService,
    TaskVisibilityModule,
  ],
})
export class TasksModule {}
