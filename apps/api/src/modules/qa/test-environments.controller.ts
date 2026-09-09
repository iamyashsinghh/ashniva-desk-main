import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type TestEnvironmentRow } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateTestEnvironmentDto, UpdateTestEnvironmentDto } from './dto/test-environment.dto';
import { TestEnvironmentsService } from './test-environments.service';

type Actor = AuthenticatedUser;
const id = () => Param('id', ParseUUIDPipe);

/**
 * Deployed environments. Reading one is part of reading a project; recording one is part of
 * looking after the test estate, which is the same trust as looking after its logins.
 */
@ApiTags('Test environments')
@ApiBearerAuth()
@Controller()
export class TestEnvironmentsController {
  constructor(private readonly environments: TestEnvironmentsService) {}

  @Get('projects/:id/environments')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: "A project's environments, what is deployed and whether it is up" })
  list(@CurrentUser() actor: Actor, @id() projectId: string): Promise<TestEnvironmentRow[]> {
    return this.environments.listForProject(actor, projectId);
  }

  @Post('projects/:id/environments')
  @RequirePermissions(PERMISSIONS.TEST_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Record an environment a tester can reach' })
  create(
    @CurrentUser() actor: Actor,
    @id() projectId: string,
    @Body() dto: CreateTestEnvironmentDto,
  ): Promise<TestEnvironmentRow> {
    return this.environments.create(actor, projectId, dto);
  }

  @Patch('environments/:id')
  @RequirePermissions(PERMISSIONS.TEST_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Update the URL, status or what is deployed there' })
  update(
    @CurrentUser() actor: Actor,
    @id() environmentId: string,
    @Body() dto: UpdateTestEnvironmentDto,
  ): Promise<TestEnvironmentRow> {
    return this.environments.update(actor, environmentId, dto);
  }
}
