import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { WorkPlanController } from './work-plan.controller';
import { WorkPlanEventsService } from './work-plan-events.service';
import { WorkPlanGeminiService } from './work-plan-gemini';
import { WorkPlanMapper } from './work-plan.mapper';
import { WorkPlanRepository } from './work-plan.repository';
import { WorkPlanService } from './work-plan.service';
import { WorkPlanTasksService } from './work-plan-tasks.service';

@Module({
  imports: [ProjectsModule, FilesModule, NotificationsModule, TasksModule],
  controllers: [WorkPlanController],
  providers: [
    WorkPlanRepository,
    WorkPlanMapper,
    WorkPlanGeminiService,
    WorkPlanEventsService,
    WorkPlanTasksService,
    WorkPlanService,
  ],
})
export class ProjectWorkPlansModule {}
