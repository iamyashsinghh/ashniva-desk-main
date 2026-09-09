import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
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
import { UatCommentDto, UatDecisionDto } from './dto/uat.dto';
import { PortalUatService } from './portal-uat.service';

type Actor = AuthenticatedUser;
const id = () => Param('id', ParseUUIDPipe);

/**
 * Client portal: what this organization has been asked to sign off, and its answer.
 *
 * Reading and asking a question need `project:read`, which every client role has, so somebody at
 * the client can look at the change and query it. Only `uat:decide` — the client admin — actually
 * signs it off.
 */
@ApiTags('Client portal')
@ApiBearerAuth()
@Controller('portal/uat')
export class PortalUatController {
  constructor(private readonly uat: PortalUatService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Your pending and decided sign-offs' })
  list(@CurrentUser() actor: Actor): Promise<UatRequestSummary[]> {
    return this.uat.list(actor);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'What you are being asked to approve, in plain language' })
  detail(@CurrentUser() actor: Actor, @id() requestId: string): Promise<UatRequestDetail> {
    return this.uat.detail(actor, requestId);
  }

  @Post(':id/decide')
  @RequirePermissions(PERMISSIONS.UAT_DECIDE)
  @ApiOperation({ summary: 'Approve, or ask for changes and say what they are' })
  decide(
    @CurrentUser() actor: Actor,
    @id() requestId: string,
    @Body() dto: UatDecisionDto,
  ): Promise<UatRequestDetail> {
    return this.uat.decide(actor, requestId, dto);
  }

  @Post(':id/comments')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Ask the provider a question before answering' })
  comment(
    @CurrentUser() actor: Actor,
    @id() requestId: string,
    @Body() dto: UatCommentDto,
  ): Promise<UatCommentRow> {
    return this.uat.comment(actor, requestId, dto);
  }
}
