import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RELEASE_APPROVAL_DECISION,
  RELEASE_APPROVER_ROLE,
  RELEASE_ITEM_KIND,
  RELEASE_STATUS,
  TEST_ENVIRONMENT,
  type ReleaseApproverRole,
  type ReleaseItemKind,
  type ReleaseStatus,
  type TestEnvironment,
} from '@ashniva/types';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const STATUSES = Object.values(RELEASE_STATUS);
const ENVIRONMENTS = Object.values(TEST_ENVIRONMENT);
const ITEM_KINDS = Object.values(RELEASE_ITEM_KIND);
const APPROVER_ROLES = Object.values(RELEASE_APPROVER_ROLE);
const DECISIONS = [RELEASE_APPROVAL_DECISION.APPROVED, RELEASE_APPROVAL_DECISION.REJECTED];

/**
 * Versions are typed back to confirm a publish, so they may not carry surrounding whitespace or
 * anything a person cannot reproduce exactly from what they see on screen.
 */
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class ListReleasesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STATUSES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsIn(STATUSES, { each: true })
  status?: ReleaseStatus[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Matches version or title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CreateReleaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({ maxLength: 40, example: '2026.09.1' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(VERSION_PATTERN, { message: 'A version may only contain letters, digits, . _ + and -' })
  version!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    maxLength: 10000,
    description: 'Internal plan: what goes out, what to watch',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;

  @ApiPropertyOptional({ enum: ENVIRONMENTS, default: TEST_ENVIRONMENT.PRODUCTION })
  @IsOptional()
  @IsIn(ENVIRONMENTS)
  environment?: TestEnvironment;
}

export class UpdateReleaseDto {
  @ApiPropertyOptional({
    maxLength: 40,
    description: 'Draft only: the version is what approvers signed',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(VERSION_PATTERN, { message: 'A version may only contain letters, digits, . _ + and -' })
  version?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 10000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string | null;

  @ApiPropertyOptional({ enum: ENVIRONMENTS })
  @IsOptional()
  @IsIn(ENVIRONMENTS)
  environment?: TestEnvironment;
}

/** Exactly one of the three ids must be set, and it must match `kind`. Checked in the service. */
export class AddReleaseItemDto {
  @ApiProperty({ enum: ITEM_KINDS })
  @IsIn(ITEM_KINDS)
  kind!: ReleaseItemKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  changeRequestId?: string;
}

export class ApproveReleaseDto {
  @ApiProperty({ enum: DECISIONS })
  @IsIn(DECISIONS)
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ maxLength: 2000, description: 'Required when rejecting' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    enum: APPROVER_ROLES,
    description:
      'Which required sign-off this is. Defaults to the one implied by your role; a small team where one person wears two hats has to say which.',
  })
  @IsOptional()
  @IsIn(APPROVER_ROLES)
  approverRole?: ReleaseApproverRole;
}

export class ScheduleReleaseDto {
  @ApiProperty({ format: 'date-time', description: 'When the release should go out' })
  @IsDateString()
  at!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class PublishReleaseDto {
  @ApiPropertyOptional({
    maxLength: 40,
    description: 'The version, typed back. Required when the project asks for confirmation.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  confirmVersion?: string;
}

export class VerifyLiveDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RollbackReleaseDto {
  @ApiProperty({
    maxLength: 2000,
    description: 'Why it was pulled: an unexplained rollback teaches nobody',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}

export class ReopenReleaseDto {
  @ApiProperty({
    maxLength: 2000,
    description: 'Why it is going back to Draft. Every collected sign-off is discarded with it.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}
