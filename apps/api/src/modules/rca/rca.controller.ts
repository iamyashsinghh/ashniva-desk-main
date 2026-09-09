import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type ProblemDetail } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ReviewRcaDto, SubmitRcaDto } from './dto/rca.dto';
import { RcaService } from './rca.service';

/**
 * Writing an analysis and reviewing it.
 *
 * Both routes answer with the whole problem rather than with the report: the analysis moves the
 * problem's status and its closure decision, and a screen that had to fetch the problem again to
 * find that out would show the two disagreeing for a moment.
 *
 * An RCA names other clients' versions and the change that caused the fault. §5 of the product
 * requirements lists RCA discussions among the things a client is never shown, so there is no
 * portal counterpart to this controller and no mapper that could build one.
 */
@ApiTags('Root-cause analysis')
@ApiBearerAuth()
@Controller()
export class RcaController {
  constructor(private readonly rca: RcaService) {}

  @Post('problems/:id/rca')
  @RequirePermissions(PERMISSIONS.RCA_SUBMIT)
  @ApiOperation({
    summary: 'Submit the root-cause analysis (or save it as a draft)',
    description: 'A draft moves nothing; a submission takes the problem to RCA submitted.',
  })
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) problemId: string,
    @Body() dto: SubmitRcaDto,
  ): Promise<ProblemDetail> {
    return this.rca.submit(actor, problemId, dto);
  }

  @Patch('rca/:id/approve')
  @RequirePermissions(PERMISSIONS.PROBLEM_MANAGE)
  @ApiOperation({
    summary: 'Approve an analysis, or send it back with what has to be different',
    description: 'CHANGES_REQUESTED returns the problem to RCA requested and needs a note.',
  })
  review(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) rcaId: string,
    @Body() dto: ReviewRcaDto,
  ): Promise<ProblemDetail> {
    return this.rca.review(actor, rcaId, dto);
  }
}
