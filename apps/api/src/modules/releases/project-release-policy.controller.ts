import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type ProjectReleasePolicySummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ReleasePolicyService } from './release-policy.service';
import { UpdateProjectReleasePolicyDto } from './dto/release-policy.dto';

/**
 * The per-project release policy, on the project's own path because that is where it is edited.
 * Reading it needs only project access — the release page shows the checklist to everyone who can
 * see the release — while changing what a release has to satisfy needs `release:manage`.
 */
@ApiTags('Releases')
@ApiBearerAuth()
@Controller()
export class ProjectReleasePolicyController {
  constructor(private readonly policy: ReleasePolicyService) {}

  @Get('projects/:id/release-policy')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'The project’s release gates, created with defaults on first read' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectReleasePolicySummary> {
    return this.policy.get(actor, projectId);
  }

  @Put('projects/:id/release-policy')
  @RequirePermissions(PERMISSIONS.RELEASE_MANAGE)
  @ApiOperation({ summary: 'Change which sign-offs and checks a release on this project needs' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectReleasePolicyDto,
  ): Promise<ProjectReleasePolicySummary> {
    return this.policy.update(actor, projectId, dto);
  }
}
