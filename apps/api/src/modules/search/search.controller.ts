import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthenticatedUser, type SearchResponse } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SearchQueryDto } from './dto/search.dto';
import { SearchService } from './search.service';

/**
 * Search's own allowance, half the global one (`RATE_LIMIT_MAX`, 120 a minute per client IP).
 *
 * One search fans out to as many as eleven modules, so it costs an order of magnitude more than
 * an ordinary read and an unthrottled one is a cheap way to walk a database one substring at a
 * time. Sixty a minute is well past what a person types — the box debounces, and a search session
 * is a handful of requests — and it holds the worst case a single address can ask of the database
 * to roughly 660 module queries a minute.
 */
export const SEARCH_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /**
   * There is no `@RequirePermissions` here, and that is the design rather than an omission.
   *
   * A single permission on this route would be a second authorization path: a role that holds it
   * and holds nothing else would reach a route whose job is to read eleven modules, and a role
   * that does not hold it would lose search for modules it can already list. The gate is the union
   * of the per-module gates, applied per module inside the service (`SEARCH_GATES`), so a caller
   * with no searchable module gets `200` with no groups — which is also the right answer for "does
   * anything named X exist", because it is the same answer they get for everything.
   *
   * For the same reason no permission is *added* by this branch: a new key would need a data
   * migration to reach existing roles, and every role that should be able to search already holds
   * the module permissions that let it.
   *
   * Rate limited below the global allowance — see SEARCH_THROTTLE — and bounded in three more
   * ways that do not depend on counting requests: a minimum term length, a cap on the rows any
   * one module may return, and a cap on the response as a whole.
   *
   * Not audited per query. An audit row per keystroke would bury the log this product keeps for
   * decisions — grants, hour adjustments, credential reveals — under the highest-volume read in
   * the system, and it would record every client name and ticket title anybody ever typed in a
   * table that more people can read than can read some of the entities searched. The reads
   * themselves stay accountable where they already are: opening a result is a normal request to
   * that module, under that module's own rules.
   */
  @Get()
  @Throttle(SEARCH_THROTTLE)
  @ApiOperation({
    summary: 'Search across the modules you can already list, grouped by entity type',
  })
  run(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResponse> {
    return this.search.search(actor, query);
  }
}
