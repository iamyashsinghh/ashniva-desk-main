import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRIORITY, type Priority } from '@ashniva/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const PRIORITIES = Object.values(PRIORITY);

export class ParseWorkPlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fileId!: string;
}

export class WorkPlanPointDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  estimateMinutes!: number;
}

export class WorkPlanNoteDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class WorkPlanTitleDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ type: [WorkPlanPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => WorkPlanPointDto)
  points!: WorkPlanPointDto[];
}

export class WorkPlanPhaseDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  heading!: string;

  @ApiProperty({ type: [WorkPlanTitleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => WorkPlanTitleDto)
  titles!: WorkPlanTitleDto[];
}

export class SaveWorkPlanDto {
  @ApiProperty({ type: [WorkPlanPhaseDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => WorkPlanPhaseDto)
  phases!: WorkPlanPhaseDto[];
}

export class AssignWorkPlanDto {
  @ApiProperty({ enum: ['PROJECT', 'PHASE', 'TITLE'] })
  @IsIn(['PROJECT', 'PHASE', 'TITLE'])
  scope!: 'PROJECT' | 'PHASE' | 'TITLE';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  phaseId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  titleId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assignedToId?: string | null;
}

export class WorkPlanAssignmentTargetDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assignedToId?: string | null;

  @ApiPropertyOptional({ enum: PRIORITIES, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(PRIORITIES)
  priority?: Priority | null;
}

export class SaveWorkPlanAssignmentsDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assignedToId?: string | null;

  @ApiPropertyOptional({ enum: PRIORITIES, default: PRIORITY.MEDIUM })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @ApiProperty({ type: [WorkPlanAssignmentTargetDto] })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => WorkPlanAssignmentTargetDto)
  phases!: WorkPlanAssignmentTargetDto[];

  @ApiProperty({ type: [WorkPlanAssignmentTargetDto] })
  @IsArray()
  @ArrayMaxSize(1200)
  @ValidateNested({ each: true })
  @Type(() => WorkPlanAssignmentTargetDto)
  titles!: WorkPlanAssignmentTargetDto[];
}
