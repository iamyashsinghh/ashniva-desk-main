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
  type ReleaseDetail,
  type ReleaseSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ReleaseApprovalsService } from './release-approvals.service';
import { ReleaseNotePdfService } from '../release-notes/release-note-pdf.service';
import { ReleasePublishService } from './release-publish.service';
import { ReleaseTransitionsService } from './release-transitions.service';
import { ReleasesService } from './releases.service';
import {
  AddReleaseItemDto,
  ApproveReleaseDto,
  CreateReleaseDto,
  ListReleasesQueryDto,
  PublishReleaseDto,
  ReopenReleaseDto,
  RollbackReleaseDto,
  ScheduleReleaseDto,
  UpdateReleaseDto,
  VerifyLiveDto,
} from './dto/release.dto';

type Actor = AuthenticatedUser;
const id = () => Param('id', ParseUUIDPipe);

/**
 * Releases are internal end to end: they name deployment failures, staging detail and other
 * clients' work. What a client sees of a release is its release note and its UAT request, both
 * built elsewhere, so there is no portal counterpart to this controller.
 */
@ApiTags('Releases')
@ApiBearerAuth()
@Controller('releases')
export class ReleasesController {
  constructor(
    private readonly releases: ReleasesService,
    private readonly transitions: ReleaseTransitionsService,
    private readonly approvals: ReleaseApprovalsService,
    private readonly publishing: ReleasePublishService,
    private readonly notesPdf: ReleaseNotePdfService,
  ) {}

  /**
   * The release note this release shipped, as a PDF.
   *
   * Specified in `docs/api-plan.md` and left unbuilt in Phase 4 because it needed a document
   * layout of its own rather than a route to wire up. The layout lives with the release-notes
   * module, which owns the content; only a published note renders, and only its client-visible
   * items reach the page — `RenderableNote` has no field for the internal notes at all.
   */
  @Get(':id/notes.pdf')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({
    summary: 'The published release note for this release, as a PDF',
    description: 'Returns the stored file id. Internal notes and hidden items are never included.',
  })
  async releaseNotesPdf(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ fileId: string }> {
    return { fileId: await this.notesPdf.generateForRelease(actor, id) };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Releases, filterable by project and status' })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: ListReleasesQueryDto,
  ): Promise<PaginatedResponse<ReleaseSummary>> {
    return this.releases.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Start a release for a project (Draft)' })
  create(@CurrentUser() actor: Actor, @Body() dto: CreateReleaseDto): Promise<ReleaseDetail> {
    return this.releases.create(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Detail with items, approvals, history and the readiness checklist' })
  get(@CurrentUser() actor: Actor, @id() releaseId: string): Promise<ReleaseDetail> {
    return this.releases.get(actor, releaseId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Edit title, notes and environment; the version only while Draft' })
  update(
    @CurrentUser() actor: Actor,
    @id() releaseId: string,
    @Body() dto: UpdateReleaseDto,
  ): Promise<ReleaseDetail> {
    return this.releases.update(actor, releaseId, dto);
  }

  @Post(':id/items')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Add a task, ticket or change request to a Draft release' })
  addItem(
    @CurrentUser() actor: Actor,
    @id() releaseId: string,
    @Body() dto: AddReleaseItemDto,
  ): Promise<ReleaseDetail> {
    return this.releases.addItem(actor, releaseId, dto);
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Remove an item from a Draft release' })
  removeItem(
    @CurrentUser() actor: Actor,
    @id() releaseId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<ReleaseDetail> {
    return this.releases.removeItem(actor, releaseId, itemId);
  }

  @Post(':id/request-approval')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Draft → Approval requested, freezing the policy’s required sign-offs' })
  requestApproval(@CurrentUser() actor: Actor, @id() releaseId: string): Promise<ReleaseDetail> {
    return this.transitions.requestApproval(actor, releaseId);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.RELEASE_APPROVE)
  @ApiOperation({
    summary: 'Record one required sign-off; a rejection returns the release to Draft',
  })
  approve(
    @CurrentUser() actor: Actor,
    @id() releaseId: string,
    @Body() dto: ApproveReleaseDto,
  ): Promise<ReleaseDetail> {
    return this.approvals.decide(actor, releaseId, dto);
  }

  @Post(':id/schedule')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Approved → Scheduled for a time' })
  schedule(
    @CurrentUser() actor: Actor,
    @id() releaseId: string,
    @Body() dto: ScheduleReleaseDto,
  ): Promise<ReleaseDetail> {
    return this.transitions.schedule(actor, releaseId, dto);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.RELEASE_PUBLISH)
  @ApiOperation({ summary: 'Publish, once every gate is satisfied and the version is typed back' })
  publish(
    @CurrentUser() actor: Actor,
    @id() releaseId: string,
    @Body() dto: PublishReleaseDto,
  ): Promise<ReleaseDetail> {
    return this.publishing.publish(actor, releaseId, dto);
  }

  @Post(':id/verify-live')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Published → Verified live, once live verification has passed' })
  verifyLive(
    @CurrentUser() actor: Actor,
    @id() releaseId: string,
    @Body() dto: VerifyLiveDto,
  ): Promise<ReleaseDetail> {
    return this.transitions.verifyLive(actor, releaseId, dto);
  }

  @Post(':id/rollback')
  @RequirePermissions(PERMISSIONS.RELEASE_PUBLISH)
  @ApiOperation({ summary: 'Pull a release, with a reason' })
  rollback(
    @CurrentUser() actor: Actor,
    @id() releaseId: string,
    @Body() dto: RollbackReleaseDto,
  ): Promise<ReleaseDetail> {
    return this.transitions.rollback(actor, releaseId, dto);
  }

  @Post(':id/reopen')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({
    summary: 'Failed → Draft, to fix and try again (sign-offs are collected afresh)',
  })
  reopen(
    @CurrentUser() actor: Actor,
    @id() releaseId: string,
    @Body() dto: ReopenReleaseDto,
  ): Promise<ReleaseDetail> {
    return this.transitions.reopen(actor, releaseId, dto);
  }
}
