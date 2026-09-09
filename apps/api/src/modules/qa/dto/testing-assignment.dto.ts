import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CHECK_STATUS,
  TESTER_VIEW,
  TEST_ENVIRONMENT,
  TEST_RESULT,
  TEST_SEVERITY,
  TESTING_ASSIGNMENT_KIND,
  type CheckStatus,
  type TesterView,
  type TestEnvironment,
  type TestingAssignmentKind,
  type TestResult,
  type TestSeverity,
} from '@ashniva/types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
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

const VIEWS = Object.values(TESTER_VIEW);
const KINDS = Object.values(TESTING_ASSIGNMENT_KIND);
const ENVIRONMENTS = Object.values(TEST_ENVIRONMENT);
const RESULTS = Object.values(TEST_RESULT);
const SEVERITIES = Object.values(TEST_SEVERITY);
const CHECK_STATUSES = Object.values(CHECK_STATUS);

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class TesterQueueQueryDto {
  @ApiPropertyOptional({ enum: VIEWS, default: TESTER_VIEW.MINE })
  @IsOptional()
  @IsIn(VIEWS)
  view?: TesterView;

  @ApiPropertyOptional({ format: 'uuid', description: 'Narrow every count and the list' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** Everything a tester needs in order to start, captured when the work is handed over. */
export class CreateTestingAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS)
  kind!: TestingAssignmentKind;

  @ApiPropertyOptional({ enum: ENVIRONMENTS, default: TEST_ENVIRONMENT.STAGING })
  @IsOptional()
  @IsIn(ENVIRONMENTS)
  environment?: TestEnvironment;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Exactly one subject: task, ticket or release',
  })
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
  releaseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Leave empty to let a tester claim it' })
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  testAccountId?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  stagingUrl?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  whatDeveloped?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  whatToTest?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  acceptanceCriteria?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  developerNotes?: string;

  @ApiPropertyOptional({ isArray: true, type: String, description: 'Browsers or devices to cover' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  browserDevice?: string[];

  @ApiPropertyOptional({ enum: CHECK_STATUSES, description: 'Carried over from the pull request' })
  @IsOptional()
  @IsIn(CHECK_STATUSES)
  checksStatus?: CheckStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

/** The pass/fail form. A bare "failed" helps nobody, so the narrative fields are required. */
export class RecordTestResultDto {
  @ApiProperty({ enum: RESULTS })
  @IsIn(RESULTS)
  result!: TestResult;

  @ApiPropertyOptional({ enum: ENVIRONMENTS, description: "Defaults to the assignment's" })
  @IsOptional()
  @IsIn(ENVIRONMENTS)
  environment?: TestEnvironment;

  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  whatTested!: string;

  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  actualResult!: string;

  @ApiPropertyOptional({ maxLength: 5000, description: 'Required on a failure' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  failureDescription?: string;

  @ApiPropertyOptional({ enum: SEVERITIES, description: 'Required on a failure' })
  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: TestSeverity;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  browserDevice?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  commentForDeveloper?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  retestRequired?: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Screenshot or log uploaded through /files' })
  @IsOptional()
  @IsUUID()
  evidenceFileId?: string;
}

export class ClarifyAssignmentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  question!: string;
}

/**
 * Withdrawing an assignment. The reason is optional because the honest one is often "filed by
 * mistake", and demanding a sentence for that only teaches people to type a full stop.
 */
export class CancelAssignmentDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
