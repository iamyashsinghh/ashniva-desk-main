import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { ProjectDocService } from './project-doc.service';
import { WorkPlanController } from './work-plan.controller';
import { WorkPlanProposalsService } from './work-plan-proposals.service';
import { WorkPlanEventsService } from './work-plan-events.service';
import { WorkPlanGeminiService } from './work-plan-gemini';
import { WorkPlanLogoutPauseModule } from './work-plan-logout-pause.module';
import { WorkPlanMapper } from './work-plan.mapper';
import { WorkPlanRepository } from './work-plan.repository';
import { WorkPlanService } from './work-plan.service';
import { WorkPlanTaskBackfillService } from './work-plan-task-backfill.service';
import { WorkPlanTasksService } from './work-plan-tasks.service';
import { WorkTimeMonitorProcessor } from './work-time-monitor.processor';
import { WorkTimeMonitorService } from './work-time-monitor.service';

@Module({
  imports: [
    ProjectsModule,
    FilesModule,
    NotificationsModule,
    TasksModule,
    WorkPlanLogoutPauseModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.WORK_TIME_MONITOR }),
  ],
  controllers: [WorkPlanController],
  providers: [
    WorkPlanRepository,
    WorkPlanMapper,
    WorkPlanGeminiService,
    WorkPlanEventsService,
    WorkPlanTasksService,
    WorkPlanTaskBackfillService,
    ProjectDocService,
    WorkPlanService,
    WorkPlanProposalsService,
    WorkTimeMonitorService,
    WorkTimeMonitorProcessor,
  ],
  exports: [WorkPlanLogoutPauseModule, WorkTimeMonitorService],
})
export class ProjectWorkPlansModule {}
