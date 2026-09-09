import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type CodeActivitySummary,
  type RepositoryLinkSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { GitProviderQueryDto, LinkRepositoryDto } from './dto/repository.dto';
import { toCodeActivitySummary, toRepositoryLinkSummary } from './git.mapper';
import { GitService } from './git.service';
import type { ProviderRepository } from './providers/git-provider.interface';

/**
 * Repository links and development activity.
 *
 * Everything here is internal. Development activity — commit messages, branch names, PR titles,
 * reviewer names — is never exposed through the client portal, so there is no portal counterpart
 * to this controller.
 */
@ApiTags('Git integration')
@ApiBearerAuth()
@Controller()
export class GitController {
  constructor(private readonly git: GitService) {}

  @Get('git/repositories')
  @RequirePermissions(PERMISSIONS.REPOSITORY_MANAGE)
  @ApiOperation({ summary: 'Repositories the stored credential can see, for the link picker' })
  available(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: GitProviderQueryDto,
  ): Promise<ProviderRepository[]> {
    return this.git.available(actor, query.provider);
  }

  @Get('projects/:id/repositories')
  @RequirePermissions(PERMISSIONS.REPOSITORY_READ)
  @ApiOperation({ summary: 'Repositories linked to this project' })
  async listForProject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) projectId: string,
  ): Promise<RepositoryLinkSummary[]> {
    const rows = await this.git.listForProject(actor, projectId);
    return rows.map(toRepositoryLinkSummary);
  }

  @Post('projects/:id/repositories')
  @RequirePermissions(PERMISSIONS.REPOSITORY_MANAGE)
  @ApiOperation({ summary: 'Link a repository to this project' })
  async link(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: LinkRepositoryDto,
  ): Promise<RepositoryLinkSummary> {
    return toRepositoryLinkSummary(await this.git.link(actor, projectId, dto));
  }

  @Delete('repositories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.REPOSITORY_MANAGE)
  @ApiOperation({ summary: 'Unlink a repository, keeping the activity already collected' })
  unlink(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.git.unlink(actor, id);
  }

  @Get('tasks/:id/activity')
  @RequirePermissions(PERMISSIONS.REPOSITORY_READ)
  @ApiOperation({ summary: 'Commits, branches, pull requests and reviews linked to this task' })
  async taskActivity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) taskId: string,
  ): Promise<CodeActivitySummary[]> {
    const rows = await this.git.activityForTask(actor, taskId);
    return rows.map(toCodeActivitySummary);
  }

  @Get('projects/:id/activity')
  @RequirePermissions(PERMISSIONS.REPOSITORY_READ)
  @ApiOperation({ summary: 'Recent development activity across the project’s repositories' })
  async projectActivity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) projectId: string,
  ): Promise<CodeActivitySummary[]> {
    const rows = await this.git.activityForProject(actor, projectId);
    return rows.map(toCodeActivitySummary);
  }
}
