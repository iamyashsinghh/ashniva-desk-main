import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type TesterQueue,
  type TestingAssignmentDetail,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator';
import {
  CancelAssignmentDto,
  ClarifyAssignmentDto,
  CreateTestingAssignmentDto,
  RecordTestResultDto,
  TesterQueueQueryDto,
} from './dto/testing-assignment.dto';
import { QaTransitionsService } from './qa-transitions.service';
import { QaService } from './qa.service';

type Actor = AuthenticatedUser;
const id = () => Param('id', ParseUUIDPipe);

/**
 * The tester's workspace. Thin on purpose: which states an action is allowed from lives in
 * `testing-assignment-workflow.ts`, and who may see what in the services.
 */
@ApiTags('QA')
@ApiBearerAuth()
@Controller('qa/assignments')
export class QaController {
  constructor(
    private readonly qa: QaService,
    private readonly transitions: QaTransitionsService,
  ) {}

  /**
   * Either permission, not both.
   *
   * `qa:record-result` and `qa:assign` are held by disjoint sets of people — the tester records,
   * the lead or developer hands out — so gating the reads on the recorder's permission alone meant
   * whoever filed an assignment got a 403 opening the thing they had just created. Reading is not
   * the restricted direction here; recording a result and signing off a live verification are, and
   * those keep their own guards.
   */
  @Get()
  @RequireAnyPermission(PERMISSIONS.QA_RECORD_RESULT, PERMISSIONS.QA_ASSIGN)
  @ApiOperation({ summary: 'Tester queue: the nine view counts plus the selected view' })
  queue(@CurrentUser() actor: Actor, @Query() query: TesterQueueQueryDto): Promise<TesterQueue> {
    return this.qa.queue(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.QA_ASSIGN)
  @ApiOperation({ summary: 'Hand testing to somebody, with everything they need to start' })
  create(
    @CurrentUser() actor: Actor,
    @Body() dto: CreateTestingAssignmentDto,
  ): Promise<TestingAssignmentDetail> {
    return this.qa.create(actor, dto);
  }

  @Get(':id')
  @RequireAnyPermission(PERMISSIONS.QA_RECORD_RESULT, PERMISSIONS.QA_ASSIGN)
  @ApiOperation({ summary: 'The assignment payload, the test login (no password) and the results' })
  detail(
    @CurrentUser() actor: Actor,
    @id() assignmentId: string,
  ): Promise<TestingAssignmentDetail> {
    return this.qa.detail(actor, assignmentId);
  }

  @Post(':id/start')
  @RequirePermissions(PERMISSIONS.QA_RECORD_RESULT)
  @ApiOperation({ summary: 'Pending / Clarification → In progress' })
  start(@CurrentUser() actor: Actor, @id() assignmentId: string): Promise<TestingAssignmentDetail> {
    return this.transitions.start(actor, assignmentId);
  }

  @Post(':id/result')
  @RequirePermissions(PERMISSIONS.QA_RECORD_RESULT)
  @ApiOperation({ summary: 'The pass/fail form with evidence: In progress → Passed / Failed' })
  result(
    @CurrentUser() actor: Actor,
    @id() assignmentId: string,
    @Body() dto: RecordTestResultDto,
  ): Promise<TestingAssignmentDetail> {
    return this.transitions.recordResult(actor, assignmentId, dto);
  }

  @Post(':id/clarify')
  @RequirePermissions(PERMISSIONS.QA_RECORD_RESULT)
  @ApiOperation({ summary: 'Ask the developer a question: In progress → Clarification' })
  clarify(
    @CurrentUser() actor: Actor,
    @id() assignmentId: string,
    @Body() dto: ClarifyAssignmentDto,
  ): Promise<TestingAssignmentDetail> {
    return this.transitions.clarify(actor, assignmentId, dto);
  }

  /**
   * Taking testing back.
   *
   * `qa:assign`, not `qa:record-result`: whoever handed the work out may withdraw it, and a
   * tester cannot clear their own queue by cancelling what they were asked to do. CANCELLED has
   * been in the state machine and the workflow rules since the module was written, with no route
   * to reach it — so an assignment filed against the wrong task could only be left to rot in
   * somebody's queue, or worse, counted by the release gates that read every non-cancelled row.
   */
  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.QA_ASSIGN)
  @ApiOperation({ summary: 'Withdraw an assignment that should not have been made' })
  cancel(
    @CurrentUser() actor: Actor,
    @id() assignmentId: string,
    @Body() dto: CancelAssignmentDto,
  ): Promise<TestingAssignmentDetail> {
    return this.transitions.cancel(actor, assignmentId, dto);
  }

  @Post(':id/verify-live')
  @RequirePermissions(PERMISSIONS.QA_VERIFY_LIVE)
  @ApiOperation({ summary: 'Production sign-off on a live verification' })
  verifyLive(
    @CurrentUser() actor: Actor,
    @id() assignmentId: string,
  ): Promise<TestingAssignmentDetail> {
    return this.transitions.verifyLive(actor, assignmentId);
  }
}
