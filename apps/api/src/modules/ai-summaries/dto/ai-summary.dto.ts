import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  AI_SUMMARY_STATUS,
  AI_SUMMARY_TYPE,
  type AiSummaryStatus,
  type AiSummaryType,
} from '@ashniva/types';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const TYPES = Object.values(AI_SUMMARY_TYPE);
const STATUSES = Object.values(AI_SUMMARY_STATUS);

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class CreateAiSummaryDto {
  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES)
  type!: AiSummaryType;

  @ApiPropertyOptional({ maxLength: 200, description: 'Defaults to the type and the period' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The person a daily summary is about' })
  @IsOptional()
  @IsUUID()
  subjectUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for a client-facing type unless the project implies it',
  })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

  @ApiProperty({ example: '2026-09-01', description: 'Inclusive' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-09-07', description: 'Inclusive' })
  @IsDateString()
  periodEnd!: string;
}

export class EditAiSummaryDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  internalContent?: string;

  @ApiPropertyOptional({ maxLength: 20000, description: 'Client-facing types only' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  clientContent?: string;
}

export class AiSummaryNoteDto {
  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note!: string;
}

export class ListAiSummariesQueryDto {
  @ApiPropertyOptional({ enum: TYPES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(TYPES, { each: true })
  type?: AiSummaryType[];

  @ApiPropertyOptional({ enum: STATUSES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(STATUSES, { each: true })
  status?: AiSummaryStatus[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectUserId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class UsageQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Exclusive' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class PortalListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
