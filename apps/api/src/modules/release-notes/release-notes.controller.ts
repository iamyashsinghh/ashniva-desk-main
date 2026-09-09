import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type PaginatedResponse,
  type ReleaseNoteDetail,
  type ReleaseNoteHistoryEntry,
  type ReleaseNoteSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AddReleaseNoteItemDto,
  CreateReleaseNoteDto,
  EditReleaseNoteDto,
  GenerateReleaseNoteDto,
  ListReleaseNotesQueryDto,
  ReleaseNoteActionDto,
  ReorderReleaseNoteItemsDto,
} from './dto/release-note.dto';
import { ReleaseNotesQueue } from './release-notes.queue';
import { toReleaseNoteDetail, toReleaseNoteSummary } from './release-notes.mapper';
import { ReleaseNotesService } from './release-notes.service';

/**
 * Internal release-note management.
 *
 * Every route here returns the internal shape, which carries internal notes and the approval
 * trail. The client-facing counterpart is `PortalReleaseNotesController`.
 */
@ApiTags('Release notes')
@ApiBearerAuth()
@Controller('release-notes')
export class ReleaseNotesController {
  constructor(
    private readonly releaseNotes: ReleaseNotesService,
    private readonly queue: ReleaseNotesQueue,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_READ)
  @ApiOperation({ summary: 'Release notes for this organization, newest release first' })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListReleaseNotesQueryDto,
  ): Promise<PaginatedResponse<ReleaseNoteSummary>> {
    const { items, nextCursor, total } = await this.releaseNotes.list(actor, query);
    return { items: items.map(toReleaseNoteSummary), nextCursor, total };
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_READ)
  @ApiOperation({ summary: 'One release note with its items and approval trail' })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.detail(actor, id));
  }

  @Get(':id/history')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_READ)
  @ApiOperation({ summary: 'Who moved this note through the workflow, and when' })
  async history(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReleaseNoteHistoryEntry[]> {
    const row = await this.releaseNotes.detail(actor, id);
    return toReleaseNoteDetail(row).history;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_WRITE)
  @ApiOperation({ summary: 'Start a release note for a project' })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateReleaseNoteDto,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.create(actor, dto));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_WRITE)
  @ApiOperation({ summary: 'Edit a draft release note' })
  async edit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditReleaseNoteDto,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.edit(actor, id, dto));
  }

  @Post(':id/generate')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_WRITE)
  @ApiOperation({
    summary: 'Fill the draft from the work completed in the reporting period',
    description:
      'Safe to run more than once: existing and manually added items are left alone, so a ' +
      'second run adds only what is new. Pass background=true to queue the work instead.',
  })
  async generate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateReleaseNoteDto,
  ): Promise<ReleaseNoteDetail> {
    if (dto.background) {
      await this.queue.enqueueGeneration(actor, id, dto);
      return toReleaseNoteDetail(await this.releaseNotes.detail(actor, id));
    }
    return toReleaseNoteDetail(await this.releaseNotes.generate(actor, id, dto));
  }

  @Post(':id/items')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_WRITE)
  @ApiOperation({ summary: 'Add a line by hand' })
  async addItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddReleaseNoteItemDto,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.addItem(actor, id, dto));
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_WRITE)
  @ApiOperation({ summary: 'Remove a line' })
  async removeItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.removeItem(actor, id, itemId));
  }

  @Patch(':id/items/order')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_WRITE)
  @ApiOperation({ summary: 'Reorder the lines' })
  async reorder(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderReleaseNoteItemsDto,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.reorderItems(actor, id, dto.itemIds));
  }

  // -------------------------------------------------------------------------------------------
  // Workflow. The permission on each route is the coarse check; the service also verifies the
  // note is in a state the action is allowed from.
  // -------------------------------------------------------------------------------------------

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_WRITE)
  @ApiOperation({ summary: 'Send the draft for review' })
  async submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseNoteActionDto,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.act(actor, id, 'submit', dto.note));
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_APPROVE)
  @ApiOperation({ summary: 'Approve a note that is in review' })
  async approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseNoteActionDto,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.act(actor, id, 'approve', dto.note));
  }

  @Post(':id/request-changes')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_APPROVE)
  @ApiOperation({ summary: 'Send the note back with a reason' })
  async requestChanges(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseNoteActionDto,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.act(actor, id, 'requestChanges', dto.note));
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_PUBLISH)
  @ApiOperation({ summary: 'Publish an approved note to the client portal' })
  async publish(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseNoteActionDto,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.act(actor, id, 'publish', dto.note));
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_APPROVE)
  @ApiOperation({ summary: 'Cancel a note, with a reason' })
  async cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseNoteActionDto,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.act(actor, id, 'cancel', dto.note));
  }

  @Post(':id/return-to-draft')
  @RequirePermissions(PERMISSIONS.RELEASE_NOTE_WRITE)
  @ApiOperation({ summary: 'Reopen a note for editing' })
  async returnToDraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseNoteActionDto,
  ): Promise<ReleaseNoteDetail> {
    return toReleaseNoteDetail(await this.releaseNotes.act(actor, id, 'returnToDraft', dto.note));
  }
}
