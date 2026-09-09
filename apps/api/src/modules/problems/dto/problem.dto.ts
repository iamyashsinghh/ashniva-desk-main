import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PRIORITY,
  PROBLEM_STATUS,
  PROBLEM_TICKET_RELATION,
  type Priority,
  type ProblemStatus,
  type ProblemTicketRelation,
} from '@ashniva/types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const STATUSES = Object.values(PROBLEM_STATUS);
const PRIORITIES = Object.values(PRIORITY);
const RELATIONS = Object.values(PROBLEM_TICKET_RELATION);

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class ListProblemsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STATUSES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsIn(STATUSES, { each: true })
  status?: ProblemStatus[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Matches the title, the module or the number' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CreateProblemDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ enum: PRIORITIES, default: PRIORITY.HIGH })
  @IsOptional()
  @IsIn(PRIORITIES)
  severity?: Priority;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  module?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Tickets to link now. The first one fills in the project and product.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  ticketIds?: string[];

  @ApiPropertyOptional({ enum: RELATIONS, default: PROBLEM_TICKET_RELATION.DUPLICATE })
  @IsOptional()
  @IsIn(RELATIONS)
  relation?: ProblemTicketRelation;
}

export class UpdateProblemDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  severity?: Priority;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  module?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  ownerId?: string | null;
}

export class LinkProblemTicketsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  ticketIds!: string[];

  @ApiPropertyOptional({ enum: RELATIONS, default: PROBLEM_TICKET_RELATION.DUPLICATE })
  @IsOptional()
  @IsIn(RELATIONS)
  relation?: ProblemTicketRelation;
}

export class RequestRcaDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Who owes the analysis' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ format: 'date', description: 'When it is due' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'What in particular to look at' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * One endpoint, two shapes: a question, or the answer to one.
 *
 * The approved screen shows a single "Ask developer" thread on the problem, and the answer belongs
 * to the question it answers. Splitting it into a second route would put half of one conversation
 * behind a different permission for no gain.
 */
export class AskDeveloperDto {
  @ApiPropertyOptional({ maxLength: 5000, description: 'The question. Omit when answering.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The question being answered' })
  @IsOptional()
  @IsUUID()
  questionId?: string;

  @ApiPropertyOptional({ maxLength: 5000, description: 'The answer to `questionId`' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  answer?: string;
}

export class AssignFixDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The task doing the permanent fix. A link, never a second copy of the work.',
  })
  @IsUUID()
  taskId!: string;
}

export class PreventiveTestDto {
  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'The test that stops this coming back, in words',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  preventiveTest?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The task adding that test' })
  @IsOptional()
  @IsUUID()
  taskId?: string;
}

export class CloseProblemDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
