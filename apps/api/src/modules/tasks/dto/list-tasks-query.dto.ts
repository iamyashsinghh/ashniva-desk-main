import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ALL_TASK_STATUSES,
  PRIORITY,
  TASK_LIST_VIEW,
  type Priority,
  type TaskListView,
  type TaskStatus,
} from '@ashniva/types';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const PRIORITIES = Object.values(PRIORITY);
const VIEWS = Object.values(TASK_LIST_VIEW);

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true';

export class ListTasksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: VIEWS, default: TASK_LIST_VIEW.MY })
  @IsOptional()
  @IsIn(VIEWS)
  view?: TaskListView;

  @ApiPropertyOptional({ enum: ALL_TASK_STATUSES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(ALL_TASK_STATUSES, { each: true })
  status?: TaskStatus[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @ApiPropertyOptional({
    description:
      'Keep only tasks past their due date and still open. Combines with any view, so a ' +
      'dashboard card can link to exactly the set of tasks it counted.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({
    description: 'Keep only tasks completed today (server date), for the "Completed today" card.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  completedToday?: boolean;

  @ApiPropertyOptional({
    description: 'Keep only open tasks scheduled to start today, for the "Scheduled today" card.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  scheduledToday?: boolean;

  @ApiPropertyOptional({
    description: 'Keep only tasks actually started today, for the "Started today" card.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  startedToday?: boolean;

  @ApiPropertyOptional({
    description: 'Keep only open tasks whose scheduled start is still ahead ("Upcoming" card).',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  upcoming?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
