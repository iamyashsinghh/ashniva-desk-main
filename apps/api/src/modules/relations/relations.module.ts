import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { RecurringIssuesModule } from '../recurring-issues/recurring-issues.module';
import { TaskVisibilityModule } from '../tasks/task-visibility.module';
import { TaskVisibilityService } from '../tasks/task-visibility.service';
import { TicketsModule } from '../tickets/tickets.module';
import { RelationNotificationsService } from './relation-notifications.service';
import { RelationsRepository } from './relations.repository';
import { TASK_SCOPE } from './task-scope';
import { TaskRelationsController } from './task-relations.controller';
import { TaskRelationsService } from './task-relations.service';
import { TicketRelationCandidatesService } from './ticket-relation-candidates.service';
import { TicketRelationsController } from './ticket-relations.controller';
import { TicketRelationsService } from './ticket-relations.service';

/**
 * Duplicate and related work items: ticket ↔ ticket and task ↔ task.
 *
 * Its own module rather than an addition to `tickets` and `tasks`, for three reasons. The rule is
 * one rule and lives in one place — `planRelation` decides for both kinds. The visibility filter is
 * the interesting part of the feature and belongs beside the thing it protects rather than spread
 * over two mappers. And it imports the ticket and task sides rather than being imported by them, so
 * neither of those modules has to know this exists.
 *
 * `TicketsModule` supplies the ticket read scope and the cancel transition; `RecurringIssuesModule`
 * supplies the duplicate matcher, so the candidates offered in the link dialog are the same ranking
 * the recurring-issues panel shows rather than a second opinion.
 *
 * The task read scope arrives through the `TASK_SCOPE` token rather than being written here, for
 * the same reason: it is the tasks module's rule. `TaskVisibilityService` satisfies the token
 * structurally, so it is bound with `useExisting` rather than `useClass` — `resolve` queries teams
 * and projects, and a second instance would be a second copy of that work when the point of the
 * seam is that there is one answer. `OrganizationTaskScope` stays in `task-scope.ts` unbound: it is
 * the tenant-only fallback this module shipped with before the tasks module owned the rule.
 */
@Module({
  imports: [TicketsModule, RecurringIssuesModule, NotificationsModule, TaskVisibilityModule],
  controllers: [TicketRelationsController, TaskRelationsController],
  providers: [
    { provide: TASK_SCOPE, useExisting: TaskVisibilityService },
    RelationsRepository,
    RelationNotificationsService,
    TicketRelationsService,
    TicketRelationCandidatesService,
    TaskRelationsService,
  ],
  exports: [TicketRelationsService, TaskRelationsService],
})
export class RelationsModule {}
