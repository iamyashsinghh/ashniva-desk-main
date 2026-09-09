import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AuthenticatedUser,
  PaginatedResponse,
  PortalReleaseNote,
  PortalReleaseNoteSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListReleaseNotesQueryDto } from './dto/release-note.dto';
import { PortalReleaseNotesService } from './portal-release-notes.service';
import { toPortalReleaseNote, toPortalReleaseNoteSummary } from './release-notes.mapper';

/**
 * Release notes as a client sees them.
 *
 * Three things separate this from the internal controller, and all three are deliberate rather
 * than a filter that could be turned off: the scope column is `clientOrganizationId`, the status
 * is fixed to published, and the response type has no field for internal notes or the approval
 * trail to be mapped into.
 *
 * There is no release-note permission on these routes. Portal membership is the authorisation —
 * a client user holds no `release-note:*` permission, and requiring one would lock them out of
 * their own published notes.
 */
@ApiTags('Client portal')
@ApiBearerAuth()
@Controller('portal/release-notes')
export class PortalReleaseNotesController {
  constructor(private readonly releaseNotes: PortalReleaseNotesService) {}

  @Get()
  @ApiOperation({ summary: 'Published release notes for your projects' })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListReleaseNotesQueryDto,
  ): Promise<PaginatedResponse<PortalReleaseNoteSummary>> {
    const { items, nextCursor, total } = await this.releaseNotes.list(actor, query);
    return { items: items.map(toPortalReleaseNoteSummary), nextCursor, total };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One published release note' })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalReleaseNote> {
    return toPortalReleaseNote(await this.releaseNotes.detail(actor, id));
  }
}
