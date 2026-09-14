import { Module } from '@nestjs/common';

import { ProjectTeamGroupModule } from '../communication/project-team-group.module';
import { TeamsController } from './teams.controller';
import { TeamsRepository } from './teams.repository';
import { TeamsService } from './teams.service';

/** Teams with a lead; membership drives "Team Tasks" and team workload on dashboards. */
@Module({
  imports: [ProjectTeamGroupModule],
  controllers: [TeamsController],
  providers: [TeamsRepository, TeamsService],
  exports: [TeamsRepository],
})
export class TeamsModule {}
