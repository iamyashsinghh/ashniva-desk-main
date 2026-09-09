import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type MilestoneDetail,
  type MilestoneSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateMilestoneDto,
  DeliverableDoneDto,
  ListMilestonesQueryDto,
  MilestoneProgressDto,
  MilestoneStatusDto,
  UpdateMilestoneDto,
} from './dto/milestone.dto';
import { MilestoneProgressService } from './milestone-progress.service';
import { MilestonesService } from './milestones.service';

@ApiTags('Milestones')
@ApiBearerAuth()
@Controller('milestones')
export class MilestonesController {
  constructor(
    private readonly milestones: MilestonesService,
    private readonly progress: MilestoneProgressService,
  ) {}

  /**
   * The internal plan, gated on the permission that owns it.
   *
   * `project:read` is held by every internal role, so this list handed a developer or a tester
   * every client's milestone plan and dates. Its two callers — the milestone form's sibling list
   * and the change request's task generator — are behind `milestone:manage` and
   * `change-request:manage`, whose holders all hold this key. The portal keeps its own list at
   * `GET /portal/milestones`, and `GET /milestones/:id` keeps `project:read` because a change
   * request links straight to it.
   */
  @Get()
  @RequirePermissions(PERMISSIONS.MILESTONE_MANAGE)
  @ApiOperation({ summary: 'Milestones of a project, contract or client, with progress' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListMilestonesQueryDto,
  ): Promise<MilestoneSummary[]> {
    return this.milestones.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MILESTONE_MANAGE)
  @ApiOperation({ summary: 'Create a milestone with deliverables and dependencies' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateMilestoneDto,
  ): Promise<MilestoneDetail> {
    return this.milestones.create(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Milestone detail: deliverables, dependencies, linked tasks, history' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MilestoneDetail> {
    return this.milestones.get(actor, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MILESTONE_MANAGE)
  @ApiOperation({ summary: 'Edit a milestone (fields, deliverables, dependencies)' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilestoneDto,
  ): Promise<MilestoneDetail> {
    return this.milestones.update(actor, id, dto);
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.MILESTONE_MANAGE)
  @ApiOperation({
    summary: 'Move a milestone through Planned → In progress → Completed (or hold/cancel)',
  })
  changeStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MilestoneStatusDto,
  ): Promise<MilestoneDetail> {
    return this.progress.changeStatus(actor, id, dto);
  }

  @Post(':id/progress')
  @RequirePermissions(PERMISSIONS.MILESTONE_MANAGE)
  @ApiOperation({
    summary: 'Override the automatic progress with a reason (audited), or reset to automatic',
  })
  adjustProgress(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MilestoneProgressDto,
  ): Promise<MilestoneDetail> {
    return this.progress.adjustProgress(actor, id, dto);
  }

  @Patch(':id/deliverables/:deliverableId')
  @RequirePermissions(PERMISSIONS.TASK_WORK)
  @ApiOperation({ summary: 'Mark a deliverable done or not done' })
  setDeliverableDone(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deliverableId', ParseUUIDPipe) deliverableId: string,
    @Body() dto: DeliverableDoneDto,
  ): Promise<MilestoneDetail> {
    return this.progress.setDeliverableDone(actor, id, deliverableId, dto.isDone);
  }
}
