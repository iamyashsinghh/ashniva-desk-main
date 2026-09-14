import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { ProjectsModule } from '../projects/projects.module';
import { WorkPlanController } from './work-plan.controller';
import { WorkPlanGeminiService } from './work-plan-gemini';
import { WorkPlanMapper } from './work-plan.mapper';
import { WorkPlanRepository } from './work-plan.repository';
import { WorkPlanService } from './work-plan.service';

@Module({
  imports: [ProjectsModule, FilesModule],
  controllers: [WorkPlanController],
  providers: [WorkPlanRepository, WorkPlanMapper, WorkPlanGeminiService, WorkPlanService],
})
export class ProjectWorkPlansModule {}
