import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type ChangeRequestDetail,
  type ChangeRequestSummary,
  type CommentSummary,
  type PaginatedResponse,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ChangeRequestTasksService } from './change-request-tasks.service';
import { ChangeRequestTransitionsService } from './change-request-transitions.service';
import { ChangeRequestsService } from './change-requests.service';
import {
  ChangeRequestCommentDto,
  ChangeRequestDecisionDto,
  ChangeRequestNoteDto,
  CreateChangeRequestDto,
  GenerateTasksDto,
  ListChangeRequestsQueryDto,
  ScheduleChangeRequestDto,
  UpdateChangeRequestDto,
} from './dto/change-request.dto';

type Actor = AuthenticatedUser;
const id = () => Param('id', ParseUUIDPipe);

/** Internal side of change requests. Clients use /portal/change-requests. */
@ApiTags('Change requests')
@ApiBearerAuth()
@Controller('change-requests')
export class ChangeRequestsController {
  constructor(
    private readonly changeRequests: ChangeRequestsService,
    private readonly transitions: ChangeRequestTransitionsService,
    private readonly work: ChangeRequestTasksService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_READ)
  @ApiOperation({ summary: 'Change requests, filterable by status, client, project, contract' })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: ListChangeRequestsQueryDto,
  ): Promise<PaginatedResponse<ChangeRequestSummary>> {
    return this.changeRequests.list(actor, query, { internalOnly: true }) as Promise<
      PaginatedResponse<ChangeRequestSummary>
    >;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_RAISE)
  @ApiOperation({ summary: 'Raise a change request on behalf of a client (starts as Draft)' })
  create(@CurrentUser() actor: Actor, @Body() dto: CreateChangeRequestDto) {
    return this.changeRequests.create(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_READ)
  @ApiOperation({ summary: 'Detail with comments, files, linked tasks and milestones, history' })
  get(@CurrentUser() actor: Actor, @id() crId: string): Promise<ChangeRequestDetail> {
    return this.changeRequests.get(actor, crId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_RAISE)
  @ApiOperation({ summary: 'Edit fields, estimates, cost/timeline impact, internal notes' })
  update(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: UpdateChangeRequestDto) {
    return this.changeRequests.update(actor, crId, dto);
  }

  @Post(':id/comments')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_READ)
  @ApiOperation({ summary: 'Public reply or internal note' })
  comment(
    @CurrentUser() actor: Actor,
    @id() crId: string,
    @Body() dto: ChangeRequestCommentDto,
  ): Promise<CommentSummary> {
    return this.changeRequests.addComment(actor, crId, dto);
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_RAISE)
  @ApiOperation({ summary: 'Draft → Submitted' })
  submit(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: ChangeRequestNoteDto) {
    return this.transitions.submit(actor, crId, dto.note);
  }

  @Post(':id/start-internal-review')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_MANAGE)
  @ApiOperation({ summary: 'Submitted → Internal review' })
  startInternalReview(
    @CurrentUser() actor: Actor,
    @id() crId: string,
    @Body() dto: ChangeRequestNoteDto,
  ) {
    return this.transitions.startInternalReview(actor, crId, dto.note);
  }

  @Post(':id/send-to-client')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_MANAGE)
  @ApiOperation({ summary: 'Internal review → Client review (publishes an approval request)' })
  sendToClient(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: ChangeRequestNoteDto) {
    return this.transitions.sendToClient(actor, crId, dto.note);
  }

  @Post(':id/request-changes')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_MANAGE)
  @ApiOperation({ summary: 'Internal review → Changes requested (with a reason)' })
  requestChanges(
    @CurrentUser() actor: Actor,
    @id() crId: string,
    @Body() dto: ChangeRequestDecisionDto,
  ) {
    return this.transitions.requestChanges(actor, crId, dto.note);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_MANAGE)
  @ApiOperation({ summary: 'Internal review → Rejected (with a reason)' })
  reject(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: ChangeRequestDecisionDto) {
    return this.transitions.reject(actor, crId, dto.note);
  }

  @Post(':id/schedule')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_MANAGE)
  @ApiOperation({ summary: 'Approved → Scheduled (with a date)' })
  schedule(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: ScheduleChangeRequestDto) {
    return this.transitions.schedule(actor, crId, dto.scheduledFor, dto.note);
  }

  @Post(':id/complete')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_MANAGE)
  @ApiOperation({ summary: 'Scheduled → Completed' })
  complete(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: ChangeRequestNoteDto) {
    return this.transitions.complete(actor, crId, dto.note);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_RAISE)
  @ApiOperation({ summary: 'Cancel (requester before review, or a manager)' })
  cancel(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: ChangeRequestDecisionDto) {
    return this.transitions.cancel(actor, crId, dto.note);
  }

  @Post(':id/reopen-draft')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_RAISE)
  @ApiOperation({ summary: 'Rejected / Changes requested → Draft' })
  reopenDraft(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: ChangeRequestNoteDto) {
    return this.transitions.reopenDraft(actor, crId, dto.note);
  }

  @Post(':id/generate-tasks')
  @RequirePermissions(PERMISSIONS.CHANGE_REQUEST_MANAGE)
  @ApiOperation({
    summary: 'Approved / Scheduled: create linked tasks, optionally under a milestone',
  })
  generateTasks(@CurrentUser() actor: Actor, @id() crId: string, @Body() dto: GenerateTasksDto) {
    return this.work.generate(actor, crId, dto);
  }
}
