import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AddedWorkPlanTopic,
  type AuthenticatedUser,
  type ProjectDoc,
  type ProjectWorkPlan,
  type WorkPlanProposal,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  ParseWorkPlanDto,
  SaveWorkPlanDto,
  AssignWorkPlanDto,
  SaveWorkPlanAssignmentsDto,
  AddWorkPlanWorkDto,
  AddWorkPlanTopicDto,
  CombineWorkPlanTitlesDto,
  CreateWorkPlanProposalDto,
  DecideWorkPlanProposalDto,
  ListWorkPlanProposalsQueryDto,
  PublishWorkPlanProposalDto,
  UpdateWorkPlanProposalDto,
  WorkPlanExplainApplyDto,
  WorkPlanExplainPreviewDto,
  WorkPlanNoteDto,
} from './dto/work-plan.dto';
import { ProjectDocService } from './project-doc.service';
import { WorkPlanProposalsService } from './work-plan-proposals.service';
import { WorkPlanService } from './work-plan.service';

@ApiTags('Project work plans')
@ApiBearerAuth()
@Controller('projects/:projectId/work-plan')
// Nest reloads this module after prisma generate so work-plan tables are on the client.
export class WorkPlanController {
  constructor(
    private readonly plans: WorkPlanService,
    private readonly proposals: WorkPlanProposalsService,
    private readonly docs: ProjectDocService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'The project phase plan, with timers and on-time percentages' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectWorkPlan> {
    return this.plans.get(actor, projectId);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Save the phase plan by hand. Super admin, project manager and team lead can edit after work has started.',
  })
  save(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SaveWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.save(actor, projectId, dto);
  }

  @Put('assignments')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Save who is assigned at project, phase and topic. Super admin, project manager and team lead.',
  })
  saveAssignments(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SaveWorkPlanAssignmentsDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.saveAssignments(actor, projectId, dto);
  }

  @Post('explain-preview')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Ask AI to rewrite Summary steps for the developer. Preview only — nothing is saved until explain-apply.',
  })
  explainPreview(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: WorkPlanExplainPreviewDto,
  ) {
    return this.plans.explainPreview(actor, projectId, dto);
  }

  @Post('explain-apply')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Apply a confirmed AI rewrite to topic/step wording. Minutes stay as set; Save assignments separately.',
  })
  explainApply(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: WorkPlanExplainApplyDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.explainApply(actor, projectId, dto);
  }

  @Post('parse')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Read an uploaded PDF and divide it into phases' })
  parse(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: ParseWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.parse(actor, projectId, dto);
  }

  @Post('add-work')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Add work from a short request. AI reads the summary, picks the phase, and fills related steps and times. Super admin, project manager and team lead.',
  })
  addWork(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AddWorkPlanWorkDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.addWork(actor, projectId, dto);
  }

  @Post('topics')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Add one topic exactly as given — phase, title, steps and developer, no AI placement. Its task is created when someone is assigned. For integrations such as AI Memory. Super admin, project manager and team lead.',
  })
  addTopic(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AddWorkPlanTopicDto,
  ): Promise<AddedWorkPlanTopic> {
    return this.plans.addTopic(actor, projectId, dto);
  }

  @Get('proposals')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Work proposed for this Summary (from AI Memory), waiting for an admin, project manager or team lead.',
  })
  listProposals(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListWorkPlanProposalsQueryDto,
  ): Promise<WorkPlanProposal[]> {
    return this.proposals.list(actor, projectId, query.status);
  }

  @Post('proposals')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Propose work for this Summary. It waits until an admin, project manager or team lead publishes (optionally after editing) or rejects it.',
  })
  createProposal(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateWorkPlanProposalDto,
  ): Promise<WorkPlanProposal> {
    return this.proposals.create(actor, projectId, dto);
  }

  @Get('proposals/:proposalId')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'One proposal and what became of it' })
  getProposal(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
  ): Promise<WorkPlanProposal> {
    return this.proposals.get(actor, projectId, proposalId);
  }

  @Patch('proposals/:proposalId')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Edit a waiting proposal. Admin, project manager and team lead.' })
  updateProposal(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: UpdateWorkPlanProposalDto,
  ): Promise<WorkPlanProposal> {
    return this.proposals.update(actor, projectId, proposalId, dto);
  }

  @Post('proposals/:proposalId/publish')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Publish a proposal into the Summary where it says (with any last edits). Admin, project manager and team lead.',
  })
  publishProposal(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: PublishWorkPlanProposalDto,
  ): Promise<{ proposal: WorkPlanProposal; plan: ProjectWorkPlan }> {
    return this.proposals.publish(actor, projectId, proposalId, dto);
  }

  @Post('proposals/:proposalId/reject')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Reject a proposal. Admin, project manager and team lead.' })
  rejectProposal(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: DecideWorkPlanProposalDto,
  ): Promise<WorkPlanProposal> {
    return this.proposals.reject(actor, projectId, proposalId, dto);
  }

  @Get('doc')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      "The project's Markdown document (features, structure, flow), rebuilt from the Summary as work moves.",
  })
  async getDoc(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectDoc> {
    const { project } = await this.plans.projectAccess(actor, projectId);
    return this.docs.get(actor.organizationId, project);
  }

  @Post('doc/refresh')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Rewrite the project document now' })
  async refreshDoc(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectDoc> {
    const { project } = await this.plans.projectAccess(actor, projectId);
    return this.docs.refreshNow(actor.organizationId, project);
  }

  @Post('combine-titles')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Combine topics in one phase into a single topic. Minutes add up. Developer, team lead, project manager and director.',
  })
  combineTitles(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CombineWorkPlanTitlesDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.combineTitles(actor, projectId, dto);
  }

  @Post('assign')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Assign the whole plan, a phase, or a topic to a developer. Super admin, project manager and team lead.',
  })
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AssignWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.assign(actor, projectId, dto);
  }

  @Post('points/:pointId/start')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: "Start a point's timer" })
  start(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pointId', ParseUUIDPipe) pointId: string,
  ): Promise<ProjectWorkPlan> {
    return this.plans.start(actor, projectId, pointId);
  }

  @Post('points/:pointId/submit-test')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      "Send a started point to the tester. The developer's leftover time pauses until they resume.",
  })
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pointId', ParseUUIDPipe) pointId: string,
  ): Promise<ProjectWorkPlan> {
    return this.plans.submit(actor, projectId, pointId);
  }

  @Post('points/:pointId/start-test')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Tester starts testing a point the developer sent them' })
  startTesting(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pointId', ParseUUIDPipe) pointId: string,
  ): Promise<ProjectWorkPlan> {
    return this.plans.startTesting(actor, projectId, pointId);
  }

  @Post('points/:pointId/complete')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary: 'Tester or team lead marks the point good. A developer call sends it to the tester.',
  })
  complete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pointId', ParseUUIDPipe) pointId: string,
  ): Promise<ProjectWorkPlan> {
    return this.plans.complete(actor, projectId, pointId);
  }

  @Post('points/:pointId/return')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary:
      'Tester or team lead sends the point back with an error. Optional screenshot lands on the linked task comment.',
  })
  fail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pointId', ParseUUIDPipe) pointId: string,
    @Body() dto: WorkPlanNoteDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.fail(actor, projectId, pointId, dto);
  }

  @Post('points/:pointId/notes')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Add a doubt or issue on this point for the lead and manager' })
  note(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pointId', ParseUUIDPipe) pointId: string,
    @Body() dto: WorkPlanNoteDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.note(actor, projectId, pointId, dto);
  }

  @Post('points/:pointId/notes/:noteId/replies')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Reply on a note. Developer and tester both see the thread.' })
  reply(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pointId', ParseUUIDPipe) pointId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: WorkPlanNoteDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.reply(actor, projectId, pointId, noteId, dto);
  }
}
