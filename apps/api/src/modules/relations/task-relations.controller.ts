import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type TaskRelationsResponse } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateTaskRelationDto } from './dto/relation.dto';
import { TaskRelationsService } from './task-relations.service';

/**
 * Duplicate and related tasks.
 *
 * The same routes as the ticket side, one permission down: `task:read` to see the links and
 * `task:create` to make them. Tasks are internal everywhere in the product, so the service refuses
 * a client outright and `task_relations` carries the provider-only row-level policy — there is no
 * client shape here to get wrong.
 */
@ApiTags('Task relations')
@ApiBearerAuth()
@Controller('tasks')
export class TaskRelationsController {
  constructor(private readonly relations: TaskRelationsService) {}

  @Get(':id/relations')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'Duplicates and related tasks' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaskRelationsResponse> {
    return this.relations.list(actor, id);
  }

  @Post(':id/relations')
  @RequirePermissions(PERMISSIONS.TASK_CREATE)
  @ApiOperation({
    summary: 'Link this task to another as a duplicate or a related task',
    description: 'A pointer. Nothing is moved, merged or deleted on either task.',
  })
  link(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskRelationDto,
  ): Promise<TaskRelationsResponse> {
    return this.relations.link(actor, id, dto);
  }

  @Delete(':id/relations/:relationId')
  @RequirePermissions(PERMISSIONS.TASK_CREATE)
  @ApiOperation({ summary: 'Remove a link. Deletes the pointer and nothing else.' })
  unlink(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('relationId', ParseUUIDPipe) relationId: string,
  ): Promise<TaskRelationsResponse> {
    return this.relations.unlink(actor, id, relationId);
  }
}
