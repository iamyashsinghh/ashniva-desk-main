import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ALL_TICKET_STATUSES,
  PRIORITY,
  TICKET_LIST_VIEW,
  TICKET_TYPE,
  VISIBILITY,
  type Priority,
  type TicketListView,
  type TicketStatus,
  type TicketType,
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
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const PRIORITIES = Object.values(PRIORITY);
const TYPES = Object.values(TICKET_TYPE);
const VIEWS = Object.values(TICKET_LIST_VIEW);

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class ListTicketsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: VIEWS, default: TICKET_LIST_VIEW.OPEN })
  @IsOptional()
  @IsIn(VIEWS)
  view?: TicketListView;

  @ApiPropertyOptional({ enum: ALL_TICKET_STATUSES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(ALL_TICKET_STATUSES, { each: true })
  status?: TicketStatus[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Keep only tickets resolved today, for the "Resolved today" card.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  resolvedToday?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsIn(TYPES)
  type?: TicketType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** Raise a ticket. Clients raise for themselves; internal staff may raise on behalf of a client. */
export class CreateTicketDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  description!: string;

  @ApiPropertyOptional({ enum: TYPES, default: TICKET_TYPE.SUPPORT })
  @IsOptional()
  @IsIn(TYPES)
  type?: TicketType;

  @ApiPropertyOptional({ enum: PRIORITIES, default: PRIORITY.MEDIUM })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  module?: string;

  @ApiPropertyOptional({ maxLength: 1000, description: 'What you cannot do because of this' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  impact?: string;

  /**
   * Free text, and deliberately so: a client names their own build. Forcing it into a known
   * release id would lose the reports that matter most — the ones from somebody running something
   * we did not expect.
   */
  @ApiPropertyOptional({
    maxLength: 60,
    description: 'The version you are running',
    example: '3.1.4',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  productVersion?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Files uploaded beforehand' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  fileIds?: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Internal staff only: the client company' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Internal staff only: the person asking' })
  @IsOptional()
  @IsUUID()
  requesterId?: string;
}

export class AssignTicketDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assignedToId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  teamId?: string | null;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsIn(TYPES)
  type?: TicketType;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class TicketNoteDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ResolveTicketDto {
  @ApiProperty({ maxLength: 2000, description: 'What was done; shown to the client' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  resolution!: string;
}

export class ReopenTicketDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}

export class TicketCommentDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({ enum: Object.values(VISIBILITY), default: VISIBILITY.CLIENT })
  @IsOptional()
  @IsIn(Object.values(VISIBILITY))
  visibility?: Visibility;
}

export class ConvertTaskInputDto {
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

/** One ticket → one or many linked tasks. */
export class ConvertTicketDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiPropertyOptional({ enum: PRIORITIES, description: 'Defaults to the ticket priority' })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  testerId?: string;

  @ApiProperty({ type: [ConvertTaskInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ConvertTaskInputDto)
  tasks!: ConvertTaskInputDto[];
}
