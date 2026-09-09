import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type ApprovalDetail,
  type ApprovalSummary,
  type AuthenticatedUser,
  type PaginatedResponse,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator';
import { ApprovalTransitionsService } from './approval-transitions.service';
import { ApprovalsService } from './approvals.service';
import {
  ApprovalCommentDto,
  CreateApprovalDto,
  ListApprovalsQueryDto,
  UpdateApprovalDto,
} from './dto/approval.dto';

/** Internal side of client approvals (distinct from the Theme Manager's publishing approvals). */
@ApiTags('Approvals')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly transitions: ApprovalTransitionsService,
  ) {}

  /**
   * Preparing an approval or deciding one — the two halves of this screen, and the pair the
   * sidebar has always gated the Approvals link on.
   *
   * `project:read` is held by every internal role and by every client role, so the internal
   * inbox — every client's approval titles and the company each belongs to — was readable by a
   * developer and a tester, neither of whom is ever shown a link to it.
   */
  @Get()
  @RequireAnyPermission(PERMISSIONS.APPROVAL_MANAGE, PERMISSIONS.APPROVAL_DECIDE)
  @ApiOperation({
    summary: 'Approval requests by view (inbox, mine, waiting-client, decided, all)',
  })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListApprovalsQueryDto,
  ): Promise<PaginatedResponse<ApprovalSummary>> {
    return this.approvals.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.APPROVAL_MANAGE)
  @ApiOperation({
    summary: 'Prepare an approval request for an update, milestone, document, CR or file',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateApprovalDto,
  ): Promise<ApprovalDetail> {
    return this.approvals.create(actor, dto);
  }

  @Get(':id')
  @RequireAnyPermission(PERMISSIONS.APPROVAL_MANAGE, PERMISSIONS.APPROVAL_DECIDE)
  @ApiOperation({ summary: 'One approval request with files, history and available actions' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApprovalDetail> {
    return this.approvals.get(actor, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.APPROVAL_MANAGE)
  @ApiOperation({ summary: 'Edit a draft / in-review request' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApprovalDto,
  ): Promise<ApprovalDetail> {
    return this.approvals.update(actor, id, dto);
  }

  @Post(':id/send-to-internal-review')
  @RequirePermissions(PERMISSIONS.APPROVAL_MANAGE)
  @ApiOperation({ summary: 'Draft → Internal review' })
  sendToInternalReview(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalCommentDto,
  ): Promise<ApprovalDetail> {
    return this.transitions.sendToInternalReview(actor, id, dto.comment);
  }

  @Post(':id/return-to-draft')
  @RequirePermissions(PERMISSIONS.APPROVAL_MANAGE)
  @ApiOperation({ summary: 'Back to Draft after review, changes requested or rejection' })
  returnToDraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalCommentDto,
  ): Promise<ApprovalDetail> {
    return this.transitions.returnToDraft(actor, id, dto.comment);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.APPROVAL_MANAGE)
  @ApiOperation({ summary: 'Internal review → Published to client (the client can now decide)' })
  publish(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalCommentDto,
  ): Promise<ApprovalDetail> {
    return this.transitions.publish(actor, id, dto.comment);
  }

  @Post(':id/withdraw')
  @RequirePermissions(PERMISSIONS.APPROVAL_MANAGE)
  @ApiOperation({ summary: 'Withdraw a request (any non-final state)' })
  withdraw(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalCommentDto,
  ): Promise<ApprovalDetail> {
    return this.transitions.withdraw(actor, id, dto.comment);
  }
}
