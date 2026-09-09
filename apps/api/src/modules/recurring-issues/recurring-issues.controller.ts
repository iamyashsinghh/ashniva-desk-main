import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type RecurringReport,
  type SimilarTicketsResponse,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { DecideSimilarityDto, RecurringReportQueryDto } from './dto/similarity.dto';
import { RecurringReportService } from './recurring-report.service';
import { SimilarityService } from './similarity.service';

/**
 * Suggested duplicates on one ticket.
 *
 * `problem:read`, not `ticket:read`: a suggestion names the other client who reported the same
 * fault, and every client role holds `ticket:read`. The suggestions are also internal for a
 * second reason — nothing in this response has a portal shape, so there is nothing to filter.
 */
@ApiTags('Recurring issues')
@ApiBearerAuth()
@Controller('tickets')
export class SimilarTicketsController {
  constructor(private readonly similarity: SimilarityService) {}

  @Get(':id/similar')
  @RequirePermissions(PERMISSIONS.PROBLEM_READ)
  @ApiOperation({
    summary: 'Tickets that look like the same fault, ranked, with the reasons for each',
    description:
      'Already-decided pairs stay in the list: a dismissal that vanished would be dismissed again next week.',
  })
  similar(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) ticketId: string,
  ): Promise<SimilarTicketsResponse> {
    return this.similarity.suggestionsFor(actor, ticketId);
  }

  @Post(':id/similar/:candidateId/decide')
  @RequirePermissions(PERMISSIONS.PROBLEM_READ)
  @ApiOperation({
    summary: 'Confirm or dismiss one suggested duplicate',
    description:
      'Linking needs problem:manage. With only problem:suggest-duplicate a link request is stored as a suggestion for somebody who may confirm it.',
  })
  decide(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) ticketId: string,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Body() dto: DecideSimilarityDto,
  ): Promise<SimilarTicketsResponse> {
    return this.similarity.decide(actor, ticketId, candidateId, dto);
  }
}

/**
 * The recurring-issues dashboard.
 *
 * Under `/reports` because that is where the specification puts it and where a reader looks for
 * it, but it is this module's report: it counts the same things the duplicate threshold counts,
 * and a copy living with the other reports would drift from them.
 */
@ApiTags('Recurring issues')
@ApiBearerAuth()
@Controller('reports')
export class RecurringReportController {
  constructor(private readonly recurring: RecurringReportService) {}

  @Get('recurring')
  @RequirePermissions(PERMISSIONS.PROBLEM_READ)
  @ApiOperation({
    summary: 'Recurring issues grouped by product, module, version or severity',
    description:
      'Client counts are distinct client organizations, never tickets — that is what "over threshold" means.',
  })
  report(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: RecurringReportQueryDto,
  ): Promise<RecurringReport> {
    return this.recurring.report(actor, query);
  }
}
