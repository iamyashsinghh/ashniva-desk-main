import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, PaginatedResponse, PortalAiSummary } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiSummariesRepository } from './ai-summaries.repository';
import { PortalListQueryDto } from './dto/ai-summary.dto';
import { toPortalSummaries, toPortalSummary } from './portal-ai-summaries.mapper';

/**
 * Published summaries as a client sees them.
 *
 * Four things separate this from the internal controller, and none of them is a filter that could
 * be switched off: the scope column is `clientOrganizationId`, the status is fixed to published,
 * the query selects no internal column, and the response type has no field an internal value
 * could be mapped into.
 *
 * There is no `ai-summary:*` permission on these routes. A client user holds none, and requiring
 * one would lock them out of their own published summaries — the same arrangement as the portal
 * release notes and the portal invoices.
 */
@ApiTags('Client portal')
@ApiBearerAuth()
@Controller('portal/ai-summaries')
export class PortalAiSummariesController {
  constructor(private readonly repository: AiSummariesRepository) {}

  @Get()
  @ApiOperation({ summary: 'Published progress summaries for your organization' })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: PortalListQueryDto,
  ): Promise<PaginatedResponse<PortalAiSummary>> {
    const limit = query.limit ?? 20;
    const rows = await this.repository.listForClient(actor.organizationId, limit + 1, query.cursor);
    const page = rows.slice(0, limit);
    return {
      items: toPortalSummaries(page),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      total: page.length,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One published progress summary' })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalAiSummary> {
    const row = await this.repository.findForClient(actor.organizationId, id);
    const summary = row ? toPortalSummary(row) : null;
    if (!summary) {
      // The same answer for "does not exist", "belongs to another client" and "not published":
      // the client learns nothing either way.
      throw new NotFoundException('Summary not found');
    }
    return summary;
  }
}
