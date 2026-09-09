import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  INCIDENT_LINK_KIND,
  INCIDENT_STATUS,
  PRIORITY,
  type IncidentLinkKind,
  type IncidentStatus,
  type Priority,
} from '@ashniva/types';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const STATUSES = Object.values(INCIDENT_STATUS);
const PRIORITIES = Object.values(PRIORITY);
const LINK_KINDS = Object.values(INCIDENT_LINK_KIND);

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class ListIncidentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STATUSES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsIn(STATUSES, { each: true })
  status?: IncidentStatus[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  problemId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Matches the title, the impact or the number' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CreateIncidentDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ maxLength: 10000, description: 'What is broken, in as much detail as is known' })
  @IsString()
  @MinLength(3)
  @MaxLength(10000)
  description!: string;

  @ApiProperty({ enum: PRIORITIES })
  @IsIn(PRIORITIES)
  severity!: Priority;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Who is affected and how' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  impact?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The recurring fault this incident is of' })
  @IsOptional()
  @IsUUID()
  problemId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'A ticket to link straight away' })
  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the impact began, if it is known to be earlier than now',
  })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

/** Everything an incident's own screen may edit. Status moves through this too. */
export class UpdateIncidentDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ enum: STATUSES, description: 'Must be a move the workflow allows' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  severity?: Priority;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  impact?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @ApiPropertyOptional({ maxLength: 10000, description: 'Internal only; no client shape has it' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  internalNotes?: string;

  /**
   * Saved, never sent. Publishing is a separate call a person makes on purpose, so that writing
   * a draft of what a client might be told can never be the act of telling them.
   */
  @ApiPropertyOptional({
    maxLength: 5000,
    description: 'Draft of what clients may be told. Saving does not publish it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  clientSummary?: string;
}

export class EmergencyFixRequestDto {
  @ApiProperty({
    maxLength: 2000,
    description: 'Why this cannot wait for the scheduled release',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}

export class EmergencyFixDecisionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  /**
   * Required for both answers, and deliberately.
   *
   * The approval sheet states the consequence — it skips the scheduled release and still owes a
   * production smoke test afterwards — so an approval with no reasoning is exactly the record a
   * later review cannot use. A rejection without one teaches the requester nothing.
   */
  @ApiProperty({ maxLength: 2000, description: 'Why, in words. Required for either answer.' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}

export class ResolveIncidentDto {
  @ApiProperty({ maxLength: 5000, description: 'What ended the impact' })
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  resolution!: string;
}

export class CloseIncidentDto {
  @ApiPropertyOptional({ maxLength: 2000, description: 'What the follow-up concluded' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AddIncidentNoteDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

/** Exactly one of the three ids, and it must be the one `kind` names. Checked in the service. */
export class AddIncidentLinkDto {
  @ApiProperty({ enum: LINK_KINDS })
  @IsIn(LINK_KINDS)
  kind!: IncidentLinkKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  releaseId?: string;
}

export class PublishClientSummaryDto {
  @ApiPropertyOptional({
    maxLength: 5000,
    description: 'The wording to publish. Omit to publish the draft already saved.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  clientSummary?: string;
}
