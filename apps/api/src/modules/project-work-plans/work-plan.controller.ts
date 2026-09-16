import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type ProjectWorkPlan } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  ParseWorkPlanDto,
  SaveWorkPlanDto,
  AssignWorkPlanDto,
  SaveWorkPlanAssignmentsDto,
  WorkPlanNoteDto,
} from './dto/work-plan.dto';
import { WorkPlanService } from './work-plan.service';

@ApiTags('Project work plans')
@ApiBearerAuth()
@Controller('projects/:projectId/work-plan')
// Nest reloads this module after prisma generate so work-plan tables are on the client.
export class WorkPlanController {
  constructor(private readonly plans: WorkPlanService) {}

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
  @RequirePermissions(PERMISSIONS.PROJECT_MANAGE)
  @ApiOperation({ summary: 'Replace the phase plan by hand' })
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

  @Post('parse')
  @RequirePermissions(PERMISSIONS.PROJECT_MANAGE)
  @ApiOperation({ summary: 'Read an uploaded PDF and divide it into phases' })
  parse(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: ParseWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.parse(actor, projectId, dto);
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
  @ApiOperation({ summary: 'Send a started point to the tester. The timer keeps running.' })
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
    summary: 'Tester or team lead marks the point done. A developer call sends it to the tester.',
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
  @ApiOperation({ summary: 'Tester or team lead sends the point back with the issue' })
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
