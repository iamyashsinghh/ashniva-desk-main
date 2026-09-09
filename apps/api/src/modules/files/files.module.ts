import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { TaskVisibilityModule } from '../tasks/task-visibility.module';
import { FileParentsService } from './file-parents.service';
import { FilesController } from './files.controller';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';

/** Attachments stored in S3-compatible storage, uploaded and downloaded through the API. */
@Module({
  imports: [OrganizationsModule, TaskVisibilityModule],
  controllers: [FilesController],
  providers: [FilesRepository, FileParentsService, FilesService],
  exports: [FilesRepository],
})
export class FilesModule {}
