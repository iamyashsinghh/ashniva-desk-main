import { Module } from '@nestjs/common';

import { WorkLogsController } from './work-logs.controller';
import { WorkLogsRepository } from './work-logs.repository';
import { WorkLogsService } from './work-logs.service';

/**
 * Time entries written when work is submitted or logged on a task. Creation lives in the tasks
 * module (it is part of the task workflow); this module reads and aggregates.
 */
@Module({
  controllers: [WorkLogsController],
  providers: [WorkLogsRepository, WorkLogsService],
  exports: [WorkLogsRepository],
})
export class WorkLogsModule {}
