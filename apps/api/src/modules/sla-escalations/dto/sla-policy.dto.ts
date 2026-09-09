import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRIORITY, TICKET_STATUS, type Priority, type TicketStatus } from '@ashniva/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsTimezone } from './is-timezone';

const PRIORITIES = Object.values(PRIORITY);
const TICKET_STATUSES = Object.values(TICKET_STATUS);
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export class SlaRuleDto {
  @ApiProperty({ enum: PRIORITIES })
  @IsIn(PRIORITIES)
  priority!: Priority;

  @ApiProperty({ description: 'Business minutes until the first public reply is due' })
  @IsInt()
  @Min(1)
  @Max(600_000)
  firstResponseMinutes!: number;

  @ApiProperty({ description: 'Business minutes until the ticket must be resolved' })
  @IsInt()
  @Min(1)
  @Max(600_000)
  resolutionMinutes!: number;
}

export class CreateSlaPolicyDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Applies to every ticket of this client' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Applies to tickets of this project only' })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ description: 'Fallback for tickets without a client or project policy' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsTimezone()
  timezone?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(CLOCK, { message: 'businessHoursStart must be HH:MM' })
  businessHoursStart?: string;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(CLOCK, { message: 'businessHoursEnd must be HH:MM' })
  businessHoursEnd?: string;

  @ApiPropertyOptional({ type: [Number], description: '1 = Monday … 7 = Sunday' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  businessDays?: number[];

  @ApiPropertyOptional({ enum: TICKET_STATUSES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(TICKET_STATUSES, { each: true })
  pauseStatuses?: TicketStatus[];

  @ApiPropertyOptional({ minimum: 1, maximum: 99, default: 80 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  warningPercent?: number;

  @ApiProperty({ type: [SlaRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SlaRuleDto)
  rules!: SlaRuleDto[];
}

export class UpdateSlaPolicyDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsTimezone()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(CLOCK, { message: 'businessHoursStart must be HH:MM' })
  businessHoursStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(CLOCK, { message: 'businessHoursEnd must be HH:MM' })
  businessHoursEnd?: string;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  businessDays?: number[];

  @ApiPropertyOptional({ enum: TICKET_STATUSES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(TICKET_STATUSES, { each: true })
  pauseStatuses?: TicketStatus[];

  @ApiPropertyOptional({ minimum: 1, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  warningPercent?: number;

  @ApiPropertyOptional({ type: [SlaRuleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SlaRuleDto)
  rules?: SlaRuleDto[];
}
