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
  type AuthenticatedUser,
  type ProjectDetail,
  type ProjectPlan,
  type ProjectSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  SetProjectMembersDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectPlanService } from './project-plan.service';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly plans: ProjectPlanService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Projects with progress, health and task counts' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListProjectsQueryDto,
  ): Promise<ProjectSummary[]> {
    return this.projects.list(actor, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'One project with its members' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectDetail> {
    return this.projects.get(actor, id);
  }

  @Get(':id/plan')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary: 'The project plan: milestones and the work under them, with dates and progress',
  })
  plan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectPlan> {
    return this.plans.forProject(actor, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROJECT_MANAGE)
  @ApiOperation({ summary: 'Create a project' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectDetail> {
    return this.projects.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PROJECT_MANAGE)
  @ApiOperation({ summary: 'Edit a project' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectDetail> {
    return this.projects.update(actor, id, dto);
  }

  @Put(':id/members')
  @RequirePermissions(PERMISSIONS.PROJECT_MANAGE)
  @ApiOperation({ summary: 'Replace the project members' })
  setMembers(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProjectMembersDto,
  ): Promise<ProjectDetail> {
    return this.projects.setMembers(actor, id, dto);
  }
}
