import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CHANGE_REQUEST_ACTION,
  PERMISSIONS,
  type AuthenticatedUser,
  type ChangeRequestSummary,
  type CommentSummary,
  type PaginatedResponse,
  type PortalChangeRequestDetail,
  type PortalChangeRequestSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ChangeRequestTransitionsService } from './change-request-transitions.service';
import { ChangeRequestsService } from './change-requests.service';
import {
  ChangeRequestCommentDto,
  ChangeRequestDecisionDto,
  ChangeRequestNoteDto,
  CreateChangeRequestDto,
  ListChangeRequestsQueryDto,
  UpdateChangeRequestDto,
} from './dto/change-request.dto';

type Actor = AuthenticatedUser;
const id = () => Param('id', ParseUUIDPipe);

/** Client portal: raise, follow and decide on change requests of the caller's organization. */
@ApiTags('Client portal')
@ApiBearerAuth()
@Controller('portal/change-requests')
export class PortalChangeRequestsController {
  constructor(
    private readonly changeRequests: ChangeRequestsService,
    private readonly transitions: ChangeRequestTransitionsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_READ)
  @ApiOperation({ summary: 'Your organization’s change requests (your own drafts included)' })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: ListChangeRequestsQueryDto,
  ): Promise<PaginatedResponse<ChangeRequestSummary | PortalChangeRequestSummary>> {
    return this.changeRequests.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_RAISE)
  @ApiOperation({ summary: 'Raise a change request (starts as Draft; submit when ready)' })
  create(@CurrentUser() actor: Actor, @Body() dto: CreateChangeRequestDto) {
    return this.changeRequests.create(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_READ)
  @ApiOperation({ summary: 'One request: description, impact, replies, shared files, history' })
  get(@CurrentUser() actor: Actor, @id() crId: string): Promise<PortalChangeRequestDetail> {
    return this.changeRequests.portalGet(actor, crId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_RAISE)
  @ApiOperation({ summary: 'Edit your draft (or a request sent back for changes)' })
  update(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: UpdateChangeRequestDto) {
    return this.changeRequests.update(actor, crId, dto);
  }

  @Post(':id/comments')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_READ)
  @ApiOperation({ summary: 'Reply to the provider' })
  comment(
    @CurrentUser() actor: Actor,
    @id() crId: string,
    @Body() dto: ChangeRequestCommentDto,
  ): Promise<CommentSummary> {
    return this.changeRequests.addComment(actor, crId, dto);
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_RAISE)
  @ApiOperation({ summary: 'Submit your draft to the provider' })
  async submit(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: ChangeRequestNoteDto) {
    await this.transitions.submit(actor, crId, dto.note);
    return this.changeRequests.portalGet(actor, crId);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_RAISE)
  @ApiOperation({ summary: 'Cancel your request before it is reviewed' })
  async cancel(
    @CurrentUser() actor: Actor,
    @id() crId: string,
    @Body() dto: ChangeRequestDecisionDto,
  ) {
    await this.transitions.cancel(actor, crId, dto.note);
    return this.changeRequests.portalGet(actor, crId);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.APPROVAL_DECIDE)
  @ApiOperation({ summary: 'Approve the proposal (client admin)' })
  approve(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: ChangeRequestNoteDto) {
    return this.transitions.decideFromPortal(
      actor,
      crId,
      CHANGE_REQUEST_ACTION.APPROVE,
      dto.note ?? null,
    );
  }

  @Post(':id/request-changes')
  @RequirePermissions(PERMISSIONS.APPROVAL_DECIDE)
  @ApiOperation({ summary: 'Ask the provider to revise the proposal' })
  requestChanges(
    @CurrentUser() actor: Actor,
    @id() crId: string,
    @Body() dto: ChangeRequestDecisionDto,
  ) {
    return this.transitions.decideFromPortal(
      actor,
      crId,
      CHANGE_REQUEST_ACTION.REQUEST_CHANGES,
      dto.note,
    );
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.APPROVAL_DECIDE)
  @ApiOperation({ summary: 'Reject the proposal' })
  reject(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: ChangeRequestDecisionDto) {
    return this.transitions.decideFromPortal(actor, crId, CHANGE_REQUEST_ACTION.REJECT, dto.note);
  }
}
