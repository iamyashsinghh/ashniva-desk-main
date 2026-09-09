import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CREDENTIAL_ROTATION_POLICY,
  TEST_ENVIRONMENT,
  type CredentialRotationPolicy,
  type TestEnvironment,
} from '@ashniva/types';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const ENVIRONMENTS = Object.values(TEST_ENVIRONMENT);
const POLICIES = Object.values(CREDENTIAL_ROTATION_POLICY);

/** A grant lasts eight hours unless asked otherwise — see docs/security-plan.md. */
export const DEFAULT_GRANT_TTL_MINUTES = 8 * 60;
export const MAX_GRANT_TTL_MINUTES = 24 * 60;

export class CreateTestAccountDto {
  @ApiProperty({ enum: ENVIRONMENTS })
  @IsIn(ENVIRONMENTS)
  environment!: TestEnvironment;

  @ApiPropertyOptional({ format: 'uuid', description: 'The concrete environment, when recorded' })
  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @ApiProperty({ maxLength: 100, example: 'Test Admin' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  username!: string;

  @ApiProperty({ maxLength: 500, description: 'Encrypted at rest; never returned by a read' })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  secret!: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'OTP route, fixed test card, and so on' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ enum: POLICIES, default: CREDENTIAL_ROTATION_POLICY.AFTER_TEST })
  @IsOptional()
  @IsIn(POLICIES)
  rotationPolicy?: CredentialRotationPolicy;

  @ApiPropertyOptional({ maxLength: 2000, description: "Endpoint that resets this account's data" })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  resetHookUrl?: string;
}

/**
 * The secret is deliberately not editable here: changing a password is a rotation, and rotation
 * has to revoke the grants that were handed out against the old one.
 */
export class UpdateTestAccountDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  username?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ enum: POLICIES })
  @IsOptional()
  @IsIn(POLICIES)
  rotationPolicy?: CredentialRotationPolicy;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  resetHookUrl?: string;

  @ApiPropertyOptional({ description: 'Retiring an account stops new grants against it' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class GrantCredentialDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  grantedToUserId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The testing assignment this is needed for' })
  @IsOptional()
  @IsUUID()
  assignmentId?: string;

  @ApiPropertyOptional({
    default: DEFAULT_GRANT_TTL_MINUTES,
    maximum: MAX_GRANT_TTL_MINUTES,
    description: 'How long the grant lasts. Defaults to eight hours.',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(MAX_GRANT_TTL_MINUTES)
  ttlMinutes?: number;

  @ApiPropertyOptional({ maxLength: 500, description: 'Shown beside every reveal in the log' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RotateTestAccountDto {
  @ApiPropertyOptional({
    maxLength: 500,
    description: 'The new password, if it was set in the product. Otherwise one is generated.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  secret?: string;
}

export class ListAccessLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  testAccountId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
