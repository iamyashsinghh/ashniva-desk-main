import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AiProviderStatus,
  type AiSummaryDetail,
  type AiSummaryListRow,
  type AiSummaryVersionDetail,
  type AiUsageTotals,
  type AuthenticatedUser,
  type PaginatedResponse,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AiSummariesQueue } from './ai-summaries.queue';
import { AiSummariesService } from './ai-summaries.service';
import { toDetail, toListRow, toSourceInspection, toVersionDetail } from './ai-summaries.mapper';
import {
  AiSummaryNoteDto,
  CreateAiSummaryDto,
  EditAiSummaryDto,
  ListAiSummariesQueryDto,
  UsageQueryDto,
} from './dto/ai-summary.dto';

/**
 * Internal AI summary management.
 *
 * Every route returns the internal shape, which carries the generated text, the sources, the runs
 * and the review trail. The client-facing counterpart is `PortalAiSummariesController`, which
 * returns a different type built by a different mapper.
 *
 * Nothing here ever returns a provider credential: the status route reports only whether one is
 * configured, and no route echoes a prompt or a provider response body.
 */
@ApiTags('AI summaries')
@ApiBearerAuth()
@Controller('ai-summaries')
export class AiSummariesController {
  constructor(
    private readonly summaries: AiSummariesService,
    private readonly queue: AiSummariesQueue,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_READ)
  @ApiOperation({ summary: 'Summaries for this organization, newest first' })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListAiSummariesQueryDto,
  ): Promise<PaginatedResponse<AiSummaryListRow>> {
    const { items, nextCursor, total } = await this.summaries.list(actor, query);
    return { items: items.map(toListRow), nextCursor, total };
  }

  @Get('provider-status')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_READ)
  @ApiOperation({ summary: 'Whether generation is available, and on which prompt version' })
  providerStatus(@CurrentUser() actor: AuthenticatedUser): Promise<AiProviderStatus> {
    return this.summaries.providerStatus(actor);
  }

  @Get('usage')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_READ)
  @ApiOperation({ summary: 'Generation runs and token counts for a period' })
  usage(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: UsageQueryDto,
  ): Promise<AiUsageTotals> {
    const to = query.to ? new Date(`${query.to}T00:00:00.000Z`) : new Date();
    const from = query.from
      ? new Date(`${query.from}T00:00:00.000Z`)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.summaries.usage(actor, from, to);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_READ)
  @ApiOperation({ summary: 'One summary with its sources, versions and generation runs' })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiSummaryDetail> {
    return toDetail(await this.summaries.detail(actor, id));
  }

  @Get(':id/sources')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_READ)
  @ApiOperation({ summary: 'The records the summary was grounded in, as they were sent' })
  async sources(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const row = await this.summaries.detail(actor, id);
    return row.sources.map(toSourceInspection);
  }

  @Get(':id/versions/:version')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_READ)
  @ApiOperation({ summary: 'What an earlier version of this summary said' })
  async version(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<AiSummaryVersionDetail> {
    return toVersionDetail(await this.summaries.version(actor, id, version));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_GENERATE)
  @ApiOperation({ summary: 'Start a summary for a period' })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateAiSummaryDto,
  ): Promise<AiSummaryDetail> {
    return toDetail(await this.summaries.create(actor, dto));
  }

  @Post(':id/generate')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_GENERATE)
  @ApiOperation({
    summary: 'Queue generation. Regenerating keeps the previous text as a version.',
  })
  async generate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiSummaryDetail> {
    // Confirms the summary exists in this tenant before anything reaches the queue.
    await this.summaries.detail(actor, id);
    await this.queue.enqueueGeneration(actor, id);
    return toDetail(await this.summaries.detail(actor, id));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_GENERATE)
  @ApiOperation({ summary: 'Edit the text by hand, while the summary is still being written' })
  async edit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditAiSummaryDto,
  ): Promise<AiSummaryDetail> {
    return toDetail(await this.summaries.edit(actor, id, dto));
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_GENERATE)
  @ApiOperation({ summary: 'Send for review' })
  async submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiSummaryDetail> {
    return toDetail(await this.summaries.transition(actor, id, 'submit'));
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_APPROVE)
  @ApiOperation({ summary: 'Approve. This is what stops the text being a draft.' })
  async approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiSummaryDetail> {
    return toDetail(await this.summaries.transition(actor, id, 'approve'));
  }

  @Post(':id/request-changes')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_APPROVE)
  @ApiOperation({ summary: 'Send back with a reason' })
  async requestChanges(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AiSummaryNoteDto,
  ): Promise<AiSummaryDetail> {
    return toDetail(await this.summaries.transition(actor, id, 'requestChanges', dto.note));
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_APPROVE, PERMISSIONS.CLIENT_UPDATE_PUBLISH)
  @ApiOperation({
    summary: 'Publish the client version to the portal. Needs the client-publish permission too.',
  })
  async publish(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiSummaryDetail> {
    return toDetail(await this.summaries.transition(actor, id, 'publish'));
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_APPROVE)
  @ApiOperation({ summary: 'Cancel with a reason' })
  async cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AiSummaryNoteDto,
  ): Promise<AiSummaryDetail> {
    return toDetail(await this.summaries.transition(actor, id, 'cancel', dto.note));
  }

  @Post(':id/return-to-draft')
  @RequirePermissions(PERMISSIONS.AI_SUMMARY_GENERATE)
  @ApiOperation({ summary: 'Reopen for editing' })
  async returnToDraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiSummaryDetail> {
    return toDetail(await this.summaries.transition(actor, id, 'returnToDraft'));
  }
}
