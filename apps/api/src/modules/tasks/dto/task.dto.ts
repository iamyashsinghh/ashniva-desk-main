import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_WORK_AREAS,
  PRIORITY,
  VISIBILITY,
  WORK_AREA_MAX_LENGTH,
  WORK_AREAS,
  normalizeWorkAreas,
  type Priority,
  type Visibility,
} from '@ashniva/types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export { ListTasksQueryDto } from './list-tasks-query.dto';

const PRIORITIES = Object.values(PRIORITY);
const VISIBILITIES = Object.values(VISIBILITY);

export class CreateTaskDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Leave empty to save as a draft' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ enum: PRIORITIES, default: PRIORITY.MEDIUM })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'When the work is meant to begin. Until then the task sits in the assignee’s Upcoming view ' +
      'and cannot be started.',
  })
  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Expected completion as an instant. What the on-time/delayed indicator measures.',
  })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({
    isArray: true,
    type: String,
    example: ['Backend', 'API'],
    description: `What the work is. Suggestions: ${WORK_AREAS.join(', ')}. Any value is accepted.`,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(WORK_AREA_MAX_LENGTH, { each: true })
  @ArrayMaxSize(MAX_WORK_AREAS)
  @Transform(({ value }) => (Array.isArray(value) ? normalizeWorkAreas(value as string[]) : value))
  workAreas?: string[];

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  module?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  estimateMinutes?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  testerId?: string;

  @ApiPropertyOptional({ maxLength: 3000 })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  acceptanceCriteria?: string;

  @ApiPropertyOptional({ default: false, description: 'Completion creates a client update' })
  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Keep as draft even when an assignee is set',
  })
  @IsOptional()
  @IsBoolean()
  saveAsDraft?: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Ticket this task is created from' })
  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Milestone the work counts towards' })
  @IsOptional()
  @IsUUID()
  milestoneId?: string;
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(WORK_AREA_MAX_LENGTH, { each: true })
  @ArrayMaxSize(MAX_WORK_AREAS)
  @Transform(({ value }) => (Array.isArray(value) ? normalizeWorkAreas(value as string[]) : value))
  workAreas?: string[];

  @ApiPropertyOptional({ maxLength: 80, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  module?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  estimateMinutes?: number | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  reviewerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  testerId?: string | null;

  @ApiPropertyOptional({ maxLength: 3000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  acceptanceCriteria?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  milestoneId?: string | null;
}

export class AssignTaskDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assignedToId!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class TaskNoteDto {
  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

/** The completion sheet: what was done, time spent, optional proof, client-visible switch. */
export class SubmitTaskDto {
  @ApiProperty({ maxLength: 2000, description: 'What was completed' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  summary!: string;

  @ApiProperty({ minimum: 1, maximum: 1440, description: 'Time spent, in minutes' })
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;

  @ApiPropertyOptional({ format: 'date', description: 'Defaults to today' })
  @IsOptional()
  @IsDateString()
  workDate?: string;

  @ApiPropertyOptional({ description: 'Link to the result (staging URL, document, …)' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  proofUrl?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'Branch, commit or pull-request reference' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  gitRef?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Already uploaded files' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  fileIds?: string[];

  @ApiPropertyOptional({ description: 'Overrides the task flag for this completion' })
  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;

  @ApiPropertyOptional({ maxLength: 1000, description: 'What the client will read, if visible' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  clientSummary?: string;
}

export class ReviewTaskDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  outcome!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ maxLength: 2000, description: 'Required when rejecting' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class LogWorkDto {
  @ApiProperty({ format: 'date' })
  @IsDateString()
  workDate!: string;

  @ApiProperty({ minimum: 1, maximum: 1440 })
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  summary!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  proofUrl?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  gitRef?: string;
}

export class CreateCommentDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({ enum: VISIBILITIES, default: VISIBILITY.INTERNAL })
  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: Visibility;
}
