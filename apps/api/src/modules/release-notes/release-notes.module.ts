import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { PortalReleaseNotesController } from './portal-release-notes.controller';
import { PortalReleaseNotesService } from './portal-release-notes.service';
import { ReleaseNotesController } from './release-notes.controller';
import { ReleaseNotesProcessor } from './release-notes.processor';
import { ReleaseNotesQueue } from './release-notes.queue';
import { ReleaseNotePdfService } from './release-note-pdf.service';
import { ReleaseNotesRepository } from './release-notes.repository';
import { ReleaseNoteGeneratorService } from './release-note-generator.service';
import { ReleaseNotesService } from './release-notes.service';

/**
 * Release notes: draft generation from completed client-visible work, the review and approval
 * workflow, and the published document a client reads in the portal.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.RELEASE_NOTES })],
  controllers: [ReleaseNotesController, PortalReleaseNotesController],
  providers: [
    ReleaseNotesRepository,
    ReleaseNotePdfService,
    ReleaseNoteGeneratorService,
    ReleaseNotesService,
    PortalReleaseNotesService,
    ReleaseNotesQueue,
    ReleaseNotesProcessor,
  ],
  exports: [ReleaseNotesService, ReleaseNotePdfService],
})
export class ReleaseNotesModule {}
