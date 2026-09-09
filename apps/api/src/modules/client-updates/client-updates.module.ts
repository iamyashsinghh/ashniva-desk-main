import { Module } from '@nestjs/common';

import { TaskVisibilityModule } from '../tasks/task-visibility.module';
import { ClientUpdatesController } from './client-updates.controller';
import { ClientUpdatesRepository } from './client-updates.repository';
import { ClientUpdatesService } from './client-updates.service';

/** Client-visible updates: created by the task workflow, published by seniors / managers. */
@Module({
  imports: [TaskVisibilityModule],
  controllers: [ClientUpdatesController],
  providers: [ClientUpdatesRepository, ClientUpdatesService],
  exports: [ClientUpdatesRepository],
})
export class ClientUpdatesModule {}
