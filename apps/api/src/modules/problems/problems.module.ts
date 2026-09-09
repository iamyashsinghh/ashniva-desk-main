import { Module } from '@nestjs/common';

import { IncidentsModule } from '../incidents/incidents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProblemActionsService } from './problem-actions.service';
import { ProblemLinkingService } from './problem-linking.service';
import { ProblemsController } from './problems.controller';
import { ProblemsRepository } from './problems.repository';
import { ProblemsService } from './problems.service';

/**
 * Problems: the same fault, reported more than once.
 *
 * Owns the record itself, the ticket group behind it, the duplicate threshold that decides
 * whether one is warranted, and the workflow from "look into this" to "closed". The analysis is
 * next door in `RcaModule`, which imports this one — the dependency runs one way so that the
 * problem's own rules cannot come to depend on the shape of a form.
 */
@Module({
  imports: [
    // The threshold alert reaches the project's senior in the request that crossed it.
    NotificationsModule,
    // A problem detail lists the incidents it caused, using the incidents module's own shapes.
    IncidentsModule,
  ],
  controllers: [ProblemsController],
  providers: [ProblemsRepository, ProblemLinkingService, ProblemsService, ProblemActionsService],
  exports: [ProblemsRepository, ProblemsService, ProblemLinkingService],
})
export class ProblemsModule {}
