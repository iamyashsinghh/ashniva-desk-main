import { Module } from '@nestjs/common';

import { ProjectReleasePolicyController } from './project-release-policy.controller';
import { ReleaseApprovalsService } from './release-approvals.service';
import { ReleaseGatesRepository } from './release-gates.repository';
import { ReleasePolicyService } from './release-policy.service';
import { ReleasePublishService } from './release-publish.service';
import { ReleaseReadinessService } from './release-readiness.service';
import { ReleaseShippedNotesService } from './release-shipped-notes.service';
import { ReleaseTransitionsService } from './release-transitions.service';
import { ReleasesController } from './releases.controller';
import { ReleasesRepository } from './releases.repository';
import { ReleasesService } from './releases.service';

/**
 * Releases: what is going out, the sign-offs a project insists on, scheduling, the typed-version
 * publish confirmation, live verification and rollback.
 *
 * The readiness checklist — approvals collected, QA passed, client UAT signed off — is computed
 * here and sent on every release detail, so the Publish button never has to work it out and can
 * always say why it is disabled.
 */
import { ReleaseNotesModule } from '../release-notes/release-notes.module';

@Module({
  // For the specified `GET /releases/:id/notes.pdf`: the route belongs to releases, the
  // document belongs to the module that owns its content.
  imports: [ReleaseNotesModule],
  controllers: [ReleasesController, ProjectReleasePolicyController],
  providers: [
    ReleasesRepository,
    ReleaseGatesRepository,
    ReleaseReadinessService,
    ReleasesService,
    ReleaseTransitionsService,
    ReleaseApprovalsService,
    ReleasePublishService,
    ReleaseShippedNotesService,
    ReleasePolicyService,
  ],
  exports: [ReleasesRepository, ReleasesService],
})
export class ReleasesModule {}
