import { Module } from '@nestjs/common';

import { ProjectTeamGroupModule } from '../communication/project-team-group.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectPlanRepository } from './project-plan.repository';
import { ProjectPlanService } from './project-plan.service';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

/** Projects of every type with members, progress and health (internal API; portal is separate). */
@Module({
  imports: [OrganizationsModule, ProjectTeamGroupModule],
  controllers: [ProjectsController],
  providers: [ProjectsRepository, ProjectsService, ProjectPlanRepository, ProjectPlanService],
  exports: [ProjectsRepository, ProjectsService, ProjectPlanService],
})
export class ProjectsModule {}
