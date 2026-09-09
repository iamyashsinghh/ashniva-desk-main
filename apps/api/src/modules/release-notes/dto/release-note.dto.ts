import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  RELEASE_NOTE_ITEM_KIND,
  RELEASE_NOTE_STATUS,
  type ReleaseNoteItemKind,
  type ReleaseNoteStatus,
} from '@ashniva/types';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
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
} from 'class-validator';

const STATUSES = Object.values(RELEASE_NOTE_STATUS);
const KINDS = Object.values(RELEASE_NOTE_ITEM_KIND);

/** Versions are shown to clients, so they are constrained rather than free text. */
const VERSION_PATTERN = /^[\w.\-+]{1,40}$/;

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class ListReleaseNotesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: STATUSES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(STATUSES, { each: true })
  status?: ReleaseNoteStatus[];

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Id of the last row on the previous page' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class CreateReleaseNoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({ example: '2026.09.1', maxLength: 40 })
  @IsString()
  @Matches(VERSION_PATTERN, {
    message: 'version may contain letters, digits, dot, dash, underscore and plus only',
  })
  version!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  releaseDate!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clientSummary?: string;

  @ApiPropertyOptional({ maxLength: 4000, description: 'Never shown to a client' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;
}

export class EditReleaseNoteDto {
  @ApiPropertyOptional({ example: '2026.09.2', maxLength: 40 })
  @IsOptional()
  @IsString()
  @Matches(VERSION_PATTERN)
  version?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clientSummary?: string;

  @ApiPropertyOptional({ maxLength: 4000, description: 'Never shown to a client' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;
}

export class GenerateReleaseNoteDto {
  @ApiPropertyOptional({
    format: 'date',
    description: 'Inclusive start. Defaults to the day after the last published note.',
  })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Inclusive end. Defaults to the release date.',
  })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 365,
    default: 30,
    description: 'Window used when the project has no previously published note',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  defaultDays?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Queue the generation instead of running it in the request',
  })
  @IsOptional()
  @IsBoolean()
  background?: boolean;
}

export class AddReleaseNoteItemDto {
  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS)
  kind!: ReleaseNoteItemKind;

  @ApiPropertyOptional({ format: 'uuid', description: 'Source row, for a non-manual item' })
  @IsOptional()
  @IsUUID()
  refId?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'Provider reference for a code activity' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalRef?: string;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  label!: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Wording the client sees instead of label' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  clientLabel?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;
}

export class ReorderReleaseNoteItemsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  itemIds!: string[];
}

/** Body for submit, approve, request changes, publish, cancel and return to draft. */
export class ReleaseNoteActionDto {
  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Required when requesting changes or cancelling',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
