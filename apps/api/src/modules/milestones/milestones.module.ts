import { Module } from '@nestjs/common';

import { MilestoneProgressService } from './milestone-progress.service';
import { MilestonesController } from './milestones.controller';
import { MilestonesRepository } from './milestones.repository';
import { MilestonesService } from './milestones.service';

/**
 * Project and contract milestones: deliverables, dependencies, automatic progress from linked
 * tasks, audited manual overrides, completion history, client visibility and approval flag.
 */
@Module({
  controllers: [MilestonesController],
  providers: [MilestonesRepository, MilestoneProgressService, MilestonesService],
  exports: [MilestonesService, MilestoneProgressService, MilestonesRepository],
})
export class MilestonesModule {}
