import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  PROBLEM_TICKET_RELATION,
  type AuthenticatedUser,
  type PaginatedResponse,
  type ProblemDetail,
  type ProblemSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AskDeveloperDto,
  AssignFixDto,
  CloseProblemDto,
  CreateProblemDto,
  LinkProblemTicketsDto,
  ListProblemsQueryDto,
  PreventiveTestDto,
  RequestRcaDto,
  UpdateProblemDto,
} from './dto/problem.dto';
import { ProblemActionsService } from './problem-actions.service';
import { ProblemsService } from './problems.service';

type Actor = AuthenticatedUser;
const id = () => Param('id', ParseUUIDPipe);

/**
 * Problems are internal by definition: a problem names every client that reported the same fault,
 * and §19.2 is explicit that one client may never learn another reported it. There is no portal
 * counterpart to this controller, and `problem:read` is deliberately not `ticket:read` — every
 * client role holds the latter.
 */
@ApiTags('Problems')
@ApiBearerAuth()
@Controller('problems')
export class ProblemsController {
  constructor(
    private readonly problems: ProblemsService,
    private readonly actions: ProblemActionsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROBLEM_READ)
  @ApiOperation({ summary: 'Problems, filterable by status, project, product and owner' })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: ListProblemsQueryDto,
  ): Promise<PaginatedResponse<ProblemSummary>> {
    return this.problems.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROBLEM_MANAGE)
  @ApiOperation({ summary: 'Open a problem, optionally with the tickets it is about' })
  create(@CurrentUser() actor: Actor, @Body() dto: CreateProblemDto): Promise<ProblemDetail> {
    return this.problems.create(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROBLEM_READ)
  @ApiOperation({
    summary: 'Detail with linked tickets, questions, the RCA and the closure decision',
    description:
      'The `closure` block is what disables Close on the screen and what the close endpoint enforces.',
  })
  get(@CurrentUser() actor: Actor, @id() problemId: string): Promise<ProblemDetail> {
    return this.problems.get(actor, problemId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PROBLEM_MANAGE)
  @ApiOperation({ summary: 'Edit title, description, severity, module and owner' })
  update(
    @CurrentUser() actor: Actor,
    @id() problemId: string,
    @Body() dto: UpdateProblemDto,
  ): Promise<ProblemDetail> {
    return this.problems.update(actor, problemId, dto);
  }

  @Post(':id/tickets')
  @RequirePermissions(PERMISSIONS.PROBLEM_MANAGE)
  @ApiOperation({ summary: 'Link tickets into the problem' })
  linkTickets(
    @CurrentUser() actor: Actor,
    @id() problemId: string,
    @Body() dto: LinkProblemTicketsDto,
  ): Promise<ProblemDetail> {
    return this.problems.linkTickets(
      actor,
      problemId,
      dto.ticketIds,
      dto.relation ?? PROBLEM_TICKET_RELATION.DUPLICATE,
    );
  }

  @Post(':id/request-rca')
  @RequirePermissions(PERMISSIONS.PROBLEM_MANAGE)
  @ApiOperation({ summary: 'Ask for a root-cause analysis, with an owner and a due date' })
  requestRca(
    @CurrentUser() actor: Actor,
    @id() problemId: string,
    @Body() dto: RequestRcaDto,
  ): Promise<ProblemDetail> {
    return this.actions.requestRca(actor, problemId, dto);
  }

  @Post(':id/ask-developer')
  @RequirePermissions(PERMISSIONS.PROBLEM_READ)
  @ApiOperation({
    summary: 'Ask the problem’s owner a question, or answer one',
    description: 'Give `body` to ask; give `questionId` and `answer` to answer.',
  })
  askDeveloper(
    @CurrentUser() actor: Actor,
    @id() problemId: string,
    @Body() dto: AskDeveloperDto,
  ): Promise<ProblemDetail> {
    return this.actions.askDeveloper(actor, problemId, dto);
  }

  @Post(':id/assign-fix')
  @RequirePermissions(PERMISSIONS.PROBLEM_MANAGE)
  @ApiOperation({ summary: 'Name the task carrying the permanent fix' })
  assignFix(
    @CurrentUser() actor: Actor,
    @id() problemId: string,
    @Body() dto: AssignFixDto,
  ): Promise<ProblemDetail> {
    return this.actions.assignFix(actor, problemId, dto);
  }

  @Post(':id/preventive-test')
  @RequirePermissions(PERMISSIONS.PROBLEM_ADD_PREVENTIVE_TEST)
  @ApiOperation({ summary: 'Record the test that stops this coming back' })
  preventiveTest(
    @CurrentUser() actor: Actor,
    @id() problemId: string,
    @Body() dto: PreventiveTestDto,
  ): Promise<ProblemDetail> {
    return this.actions.addPreventiveTest(actor, problemId, dto);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.PROBLEM_MANAGE)
  @ApiOperation({
    summary: 'Close the problem',
    description:
      'Refused with the same sentences the detail’s `closure.blockers` shows under the disabled button.',
  })
  close(
    @CurrentUser() actor: Actor,
    @id() problemId: string,
    @Body() dto: CloseProblemDto,
  ): Promise<ProblemDetail> {
    return this.actions.close(actor, problemId, dto);
  }
}
