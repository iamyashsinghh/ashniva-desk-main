import { Module } from '@nestjs/common';

import { ProblemsModule } from '../problems/problems.module';
import { RecurringReportController, SimilarTicketsController } from './recurring-issues.controller';
import { RecurringReportRepository } from './recurring-report.repository';
import { RecurringReportService } from './recurring-report.service';
import { SimilarityRepository } from './similarity.repository';
import { SimilarityService } from './similarity.service';

/**
 * Finding the ticket that is really the same ticket: the deterministic matcher, the decisions
 * people take on its suggestions, and the dashboard of what keeps coming back.
 *
 * Nothing here decides anything on its own. It ranks candidates and shows the reasons; joining
 * two clients' tickets into one problem is a person's decision, taken with `problem:manage`, and
 * carried out by the problems module this one imports.
 */
@Module({
  imports: [ProblemsModule],
  controllers: [SimilarTicketsController, RecurringReportController],
  providers: [
    SimilarityRepository,
    SimilarityService,
    RecurringReportRepository,
    RecurringReportService,
  ],
  // The link dialog in `relations` offers the same ranked candidates this package computes, so it
  // asks this repository rather than growing a second matcher that could disagree with it.
  exports: [SimilarityRepository],
})
export class RecurringIssuesModule {}
