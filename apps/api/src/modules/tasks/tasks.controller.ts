import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type CommentSummary,
  type PaginatedResponse,
  type TaskCategoryRef,
  type TaskDetail,
  type TaskSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AssignTaskDto,
  CreateCommentDto,
  CreateTaskDto,
  ListTasksQueryDto,
  LogWorkDto,
  ReviewTaskDto,
  SubmitTaskDto,
  TaskNoteDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TaskReviewService } from './task-review.service';
import { TaskTransitionsService } from './task-transitions.service';
import { TasksService } from './tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly transitions: TaskTransitionsService,
    private readonly reviews: TaskReviewService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({
    summary: 'Task list by view (my, by-me, team, today, overdue, review, done, all)',
  })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListTasksQueryDto,
  ): Promise<PaginatedResponse<TaskSummary>> {
    return this.tasks.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TASK_CREATE)
  @ApiOperation({ summary: 'Create a task (assigned, or a draft when nobody is assigned)' })
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateTaskDto): Promise<TaskDetail> {
    return this.tasks.create(actor, dto);
  }

  @Get('categories')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'Task categories of your organization' })
  categories(@CurrentUser() actor: AuthenticatedUser): Promise<TaskCategoryRef[]> {
    return this.tasks.categories(actor);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({
    summary: 'Task detail with history, comments, work logs, files and allowed actions',
  })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaskDetail> {
    return this.tasks.get(actor, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'Edit task fields (creator or manager)' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskDetail> {
    return this.tasks.update(actor, id, dto);
  }

  @Post(':id/assign')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'Assign or reassign' })
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTaskDto,
  ): Promise<TaskDetail> {
    return this.transitions.assign(actor, id, dto);
  }

  @Post(':id/start')
  @RequirePermissions(PERMISSIONS.TASK_WORK)
  @ApiOperation({ summary: 'Start working (assignee)' })
  start(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaskDetail> {
    return this.transitions.start(actor, id);
  }

  @Post(':id/block')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'Mark as blocked with a reason' })
  block(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskNoteDto,
  ): Promise<TaskDetail> {
    return this.transitions.block(actor, id, dto.reason);
  }

  @Post(':id/unblock')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'Remove the blocker' })
  unblock(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaskDetail> {
    return this.transitions.unblock(actor, id);
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.TASK_WORK)
  @ApiOperation({
    summary: 'Submit for review / testing: what was done, time spent, proof, client-visible',
  })
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitTaskDto,
  ): Promise<TaskDetail> {
    return this.reviews.submit(actor, id, dto);
  }

  @Post(':id/review')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'Approve (completes) or reject (returns to developer)' })
  review(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewTaskDto,
  ): Promise<TaskDetail> {
    return this.reviews.review(actor, id, dto);
  }

  @Post(':id/reopen')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'Reopen a completed task' })
  reopen(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskNoteDto,
  ): Promise<TaskDetail> {
    return this.transitions.reopen(actor, id, dto.reason);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.TASK_CANCEL)
  @ApiOperation({ summary: 'Cancel a task' })
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskNoteDto,
  ): Promise<TaskDetail> {
    return this.transitions.cancel(actor, id, dto.reason);
  }

  @Post(':id/work-logs')
  @RequirePermissions(PERMISSIONS.TASK_WORK)
  @ApiOperation({ summary: 'Log time without changing the status' })
  logWork(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LogWorkDto,
  ): Promise<TaskDetail> {
    return this.transitions.logWork(actor, id, dto);
  }

  @Post(':id/comments')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'Add an internal or client-visible comment' })
  comment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentSummary> {
    return this.tasks.addComment(actor, id, dto);
  }
}
