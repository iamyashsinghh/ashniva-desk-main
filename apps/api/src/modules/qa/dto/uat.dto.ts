import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UAT_DECISION, type UatDecision } from '@ashniva/types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

const STATUSES = Object.values(UAT_DECISION);

/**
 * PENDING is where a request starts, not something anybody chooses, so it is not offered here.
 * Accepting it would let a client un-decide a sign-off by "deciding" it back to pending.
 */
const DECISIONS: UatDecision[] = [UAT_DECISION.APPROVED, UAT_DECISION.CHANGES_REQUESTED];

const MAX_CHECKLIST_ITEMS = 20;

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

/**
 * What the provider asks a client to sign off.
 *
 * There is deliberately no `clientOrganizationId`: the client is derived from the release or task
 * being signed off, so a mistyped id cannot send one client's work to another for approval.
 */
export class CreateUatRequestDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'The release this sign-off gates' })
  @IsOptional()
  @IsUUID()
  releaseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Or the single task being signed off' })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiProperty({
    maxLength: 5000,
    description: 'Plain language, no jargon. This is the whole of what the client is shown.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  summaryPlain!: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'A link the client can open themselves' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  previewUrl?: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_CHECKLIST_ITEMS })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_CHECKLIST_ITEMS)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  checklist?: string[];
}

export class ListUatRequestsQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: UatDecision;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  releaseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Narrow to one client (internal list only)' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;
}

/** The client's answer. A request for changes has to say what must change. */
export class UatDecisionDto {
  @ApiProperty({ enum: DECISIONS })
  @IsIn(DECISIONS)
  decision!: UatDecision;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UatCommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  body!: string;
}
