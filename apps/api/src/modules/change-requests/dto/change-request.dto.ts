import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CHANGE_REQUEST_STATUS,
  VISIBILITY,
  type ChangeRequestStatus,
  type Visibility,
} from '@ashniva/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const STATUSES = Object.values(CHANGE_REQUEST_STATUS);
const VISIBILITIES = Object.values(VISIBILITY);
const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class ListChangeRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STATUSES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(STATUSES, { each: true })
  status?: ChangeRequestStatus[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional({ description: 'Only requests I raised' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

/** Fields both sides may write. Internal-only fields live in the update DTO's staff section. */
export class CreateChangeRequestDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ maxLength: 10000 })
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  description!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  businessReason?: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  scope?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  impact?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Staff only: raise on behalf of a client' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Staff only: the client contact who asked' })
  @IsOptional()
  @IsUUID()
  requestedById?: string;

  @ApiPropertyOptional({ type: [String], description: 'Files you uploaded, to attach' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  fileIds?: string[];
}

export class UpdateChangeRequestDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  businessReason?: string | null;

  @ApiPropertyOptional({ maxLength: 10000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  scope?: string | null;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  impact?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  contractId?: string | null;

  // ---- staff only ---------------------------------------------------------------------------

  @ApiPropertyOptional({ nullable: true, description: 'Staff: effort estimate in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  estimatedMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Staff: decimal string, client-visible' })
  @IsOptional()
  @IsNumberString()
  costImpact?: string | null;

  @ApiPropertyOptional({ maxLength: 3 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Staff: schedule impact in days' })
  @IsOptional()
  @IsInt()
  @Min(-365)
  @Max(3650)
  timelineImpactDays?: number | null;

  @ApiPropertyOptional({
    maxLength: 10000,
    nullable: true,
    description: 'Staff: never shown to clients',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  internalNotes?: string | null;
}

export class ChangeRequestNoteDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ChangeRequestDecisionDto {
  @ApiProperty({ maxLength: 2000, description: 'Why: shown to the other side' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  note!: string;
}

export class ScheduleChangeRequestDto {
  @ApiProperty({ format: 'date' })
  @IsDateString()
  scheduledFor!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ChangeRequestCommentDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({ enum: VISIBILITIES, default: VISIBILITY.CLIENT })
  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: Visibility;
}

export class GeneratedTaskInputDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class GeneratedMilestoneInputDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;
}

/** An approved request becomes work: linked tasks, optionally under a new milestone. */
export class GenerateTasksDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Defaults to the request’s project' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Attach the tasks to an existing milestone' })
  @IsOptional()
  @IsUUID()
  milestoneId?: string;

  @ApiPropertyOptional({ type: GeneratedMilestoneInputDto, description: 'Or create one' })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeneratedMilestoneInputDto)
  milestone?: GeneratedMilestoneInputDto;

  @ApiProperty({ type: [GeneratedTaskInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GeneratedTaskInputDto)
  tasks!: GeneratedTaskInputDto[];
}
