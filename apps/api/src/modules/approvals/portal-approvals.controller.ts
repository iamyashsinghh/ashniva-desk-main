import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  APPROVAL_ACTION,
  PERMISSIONS,
  type AuthenticatedUser,
  type PortalApprovalDetail,
  type PortalApprovalSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ApprovalTransitionsService } from './approval-transitions.service';
import { ApprovalsService } from './approvals.service';
import { ApprovalCommentDto, ApprovalDecisionDto } from './dto/approval.dto';

/** Client portal: published approval requests of the caller's organization and their decisions. */
@ApiTags('Client portal')
@ApiBearerAuth()
@Controller('portal/approvals')
export class PortalApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly transitions: ApprovalTransitionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Approval requests waiting for you, and those you decided' })
  list(@CurrentUser() actor: AuthenticatedUser): Promise<PortalApprovalSummary[]> {
    return this.approvals.portalList(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One request: summary, files, history, whether you may decide' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalApprovalDetail> {
    return this.approvals.portalGet(actor, id);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.APPROVAL_DECIDE)
  @ApiOperation({ summary: 'Approve (client admin; never the requester or publisher)' })
  approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalCommentDto,
  ): Promise<PortalApprovalDetail> {
    return this.transitions.decide(actor, id, APPROVAL_ACTION.APPROVE, dto.comment ?? null);
  }

  @Post(':id/request-changes')
  @RequirePermissions(PERMISSIONS.APPROVAL_DECIDE)
  @ApiOperation({ summary: 'Ask for changes, with a comment' })
  requestChanges(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ): Promise<PortalApprovalDetail> {
    return this.transitions.decide(actor, id, APPROVAL_ACTION.REQUEST_CHANGES, dto.comment);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.APPROVAL_DECIDE)
  @ApiOperation({ summary: 'Reject, with a comment' })
  reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ): Promise<PortalApprovalDetail> {
    return this.transitions.decide(actor, id, APPROVAL_ACTION.REJECT, dto.comment);
  }
}
