import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TEST_ENVIRONMENT,
  TEST_ENVIRONMENT_STATUS,
  type TestEnvironment,
  type TestEnvironmentStatus,
} from '@ashniva/types';
import { IsDateString, IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

const KINDS = Object.values(TEST_ENVIRONMENT);
const STATUSES = Object.values(TEST_ENVIRONMENT_STATUS);

export class CreateTestEnvironmentDto {
  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS)
  kind!: TestEnvironment;

  @ApiProperty({ maxLength: 2000, description: 'Where a tester actually goes' })
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url!: string;

  @ApiPropertyOptional({ enum: STATUSES, default: TEST_ENVIRONMENT_STATUS.UNKNOWN })
  @IsOptional()
  @IsIn(STATUSES)
  status?: TestEnvironmentStatus;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deployedVersion?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  deployedAt?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'Matching GitHub environment, for webhooks' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  githubEnvironmentName?: string;
}

export class UpdateTestEnvironmentDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: TestEnvironmentStatus;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deployedVersion?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  deployedAt?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  githubEnvironmentName?: string;
}
