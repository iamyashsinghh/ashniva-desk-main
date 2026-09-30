import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRIORITY, type Priority } from '@ashniva/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsDateString,
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

  /** Editor may echo this from the plan. Server never creates error rows from a save. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isError?: boolean;
}

export class WorkPlanNoteDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  fileId?: string;
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

export class AddWorkPlanWorkDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  prompt!: string;

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

export class AddWorkPlanTopicPointDto {
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

export class AddWorkPlanTopicDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  phaseId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf((dto: AddWorkPlanTopicDto) => !dto.phaseId && !dto.titleId)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  phaseHeading?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'An existing topic: the steps are added to it instead of a new topic.',
  })
  @IsOptional()
  @IsUUID()
  titleId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf((dto: AddWorkPlanTopicDto) => !dto.titleId)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiProperty({ type: [AddWorkPlanTopicPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AddWorkPlanTopicPointDto)
  points!: AddWorkPlanTopicPointDto[];

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

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  reviewerId?: string | null;
}

/** Fields a proposal carries; every one may be edited before it is published. */
class WorkPlanProposalFieldsDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  phaseId?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  phaseHeading?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  titleId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assignedToId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  reviewerId?: string | null;

  @ApiPropertyOptional({ enum: PRIORITIES, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(PRIORITIES)
  priority?: Priority | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(5000)
  context?: string | null;
}

export class CreateWorkPlanProposalDto extends WorkPlanProposalFieldsDto {
  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  externalId?: string | null;

  @ApiPropertyOptional({ maxLength: 40, default: 'AI_MEMORY' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  source?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ type: [AddWorkPlanTopicPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AddWorkPlanTopicPointDto)
  points!: AddWorkPlanTopicPointDto[];
}

export class UpdateWorkPlanProposalDto extends WorkPlanProposalFieldsDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ type: [AddWorkPlanTopicPointDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AddWorkPlanTopicPointDto)
  points?: AddWorkPlanTopicPointDto[];
}

export class DecideWorkPlanProposalDto {
  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class PublishWorkPlanProposalDto extends UpdateWorkPlanProposalDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ListWorkPlanProposalsQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'PUBLISHED', 'REJECTED', 'ALL'], default: 'PENDING' })
  @IsOptional()
  @IsIn(['PENDING', 'PUBLISHED', 'REJECTED', 'ALL'])
  status?: 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'ALL';
}

export class CombineWorkPlanTitlesDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  phaseId!: string;

  @ApiProperty({ type: [String], minItems: 2 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(30)
  @IsUUID('all', { each: true })
  titleIds!: string[];
}

export class WorkPlanExplainPreviewDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsUUID('all', { each: true })
  titleIds?: string[];

  @ApiPropertyOptional({ description: '0 for first draft; raise on Retry' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  attempt?: number;
}

export class WorkPlanExplainPointDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class WorkPlanExplainTitleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ type: [WorkPlanExplainPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => WorkPlanExplainPointDto)
  points!: WorkPlanExplainPointDto[];
}

export class WorkPlanExplainApplyDto {
  @ApiProperty({ type: [WorkPlanExplainTitleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => WorkPlanExplainTitleDto)
  titles!: WorkPlanExplainTitleDto[];
}
