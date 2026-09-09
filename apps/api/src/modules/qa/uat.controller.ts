import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type UatCommentRow,
  type UatRequestDetail,
  type UatRequestSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateUatRequestDto, ListUatRequestsQueryDto, UatCommentDto } from './dto/uat.dto';
import { UatService } from './uat.service';

type Actor = AuthenticatedUser;
const id = () => Param('id', ParseUUIDPipe);

/**
 * The provider's side of client UAT. Deciding is not here — that is the client's, on
 * `/portal/uat/:id/decide`, and this side cannot do it however senior the caller is.
 */
@ApiTags('UAT')
@ApiBearerAuth()
@Controller('uat')
export class UatController {
  constructor(private readonly uat: UatService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Sign-off requests raised for clients, pending ones first' })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: ListUatRequestsQueryDto,
  ): Promise<UatRequestSummary[]> {
    return this.uat.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Ask a client to sign off a release or a task, in plain language' })
  create(@CurrentUser() actor: Actor, @Body() dto: CreateUatRequestDto): Promise<UatRequestDetail> {
    return this.uat.create(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'One request: what was asked, the answer, and the conversation' })
  detail(@CurrentUser() actor: Actor, @id() requestId: string): Promise<UatRequestDetail> {
    return this.uat.detail(actor, requestId);
  }

  @Post(':id/comments')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: "Answer the client's question on the thread" })
  comment(
    @CurrentUser() actor: Actor,
    @id() requestId: string,
    @Body() dto: UatCommentDto,
  ): Promise<UatCommentRow> {
    return this.uat.comment(actor, requestId, dto);
  }
}
