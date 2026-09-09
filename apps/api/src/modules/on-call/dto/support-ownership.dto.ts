import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AVAILABILITY_SOURCE,
  AVAILABILITY_STATUS,
  MAX_WORK_AREAS,
  WORK_AREA_MAX_LENGTH,
  clockToMinutes,
  normalizeWorkAreas,
  type AvailabilityStatus,
} from '@ashniva/types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STATUSES = Object.values(AVAILABILITY_STATUS);
const SOURCES = Object.values(AVAILABILITY_SOURCE);

/** `HH:MM`, which is what a time input produces and what a person reads back. */
const CLOCK = /^([01]?\d|2[0-3]):[0-5]\d$/;

export class SetWorkScheduleDto {
  @ApiProperty({
    isArray: true,
    type: Number,
    example: [1, 2, 3, 4, 5],
    description: 'Days as Date.getUTCDay() numbers — Sunday is 0. Empty means no working days.',
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ArrayMaxSize(7)
  workingDays!: number[];

  @ApiProperty({ example: '09:30' })
  @Matches(CLOCK, { message: 'startTime must be HH:MM' })
  startTime!: string;

  @ApiProperty({ example: '18:30', description: 'Earlier than startTime means an overnight shift' })
  @Matches(CLOCK, { message: 'endTime must be HH:MM' })
  endTime!: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', default: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Open tickets this person may hold before the router skips them',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  workloadLimit?: number | null;
}

/**
 * One availability update.
 *
 * This is the endpoint Ashniva HR calls. It is deliberately small and does not accept a user's
 * schedule, a project, or anything else: HR knows whether somebody is at work, and nothing else
 * about how Desk routes tickets.
 */
export class SetAvailabilityDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  status!: AvailabilityStatus;

  @ApiPropertyOptional({
    enum: SOURCES,
    default: AVAILABILITY_SOURCE.MANUAL,
    description: 'Where the fact came from. HR pushes arrive as HR.',
  })
  @IsOptional()
  @IsIn(SOURCES)
  source?: (typeof SOURCES)[number];

  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'When the state stops applying, e.g. the end of a leave',
  })
  @IsOptional()
  @IsDateString()
  until?: string | null;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class SetOnCallDto {
  @ApiProperty({ format: 'date', example: '2026-09-14' })
  @IsDateString()
  onDate!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  backupUserId?: string | null;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class SetSupportOwnershipDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  primaryDeveloperId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  backupDeveloperId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  seniorId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  testerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  supportExecutiveId?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { Billing: '…uuid…', API: '…uuid…' },
    description: 'Work area or module → the user who owns it. The router tries this first.',
  })
  @IsOptional()
  @IsObject()
  moduleOwners?: Record<string, string>;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  workloadLimit?: number | null;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  ackMinutes?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  escalationMinutes?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Whether the router places tickets on this project at all',
  })
  @IsOptional()
  @IsBoolean()
  autoRouteEnabled?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Who hears about a ticket the chain could not place. Null means the support queue.',
  })
  @IsOptional()
  @IsUUID()
  fallbackUserId?: string | null;

  @ApiPropertyOptional({
    isArray: true,
    type: String,
    description: 'Ticket types routed straight to a developer instead of the support queue',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(WORK_AREA_MAX_LENGTH, { each: true })
  @ArrayMaxSize(MAX_WORK_AREAS)
  @Transform(({ value }) => (Array.isArray(value) ? normalizeWorkAreas(value as string[]) : value))
  directTypes?: string[];
}

/** Shared by the service; exported so the clock parsing lives in exactly one place. */
export function clockOrThrow(value: string): number {
  const minutes = clockToMinutes(value);
  if (minutes === null) {
    throw new Error(`${value} is not a clock time`);
  }
  return minutes;
}
