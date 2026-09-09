import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_WORK_AREAS,
  PROJECT_MEMBER_ROLE,
  PROJECT_STATUS,
  PROJECT_TYPE,
  type ProjectMemberRole,
  type ProjectStatus,
  type ProjectType,
  WORK_AREA_MAX_LENGTH,
  WORK_AREAS,
  normalizeWorkAreas,
} from '@ashniva/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const TYPES = Object.values(PROJECT_TYPE);
const STATUSES = Object.values(PROJECT_STATUS);
const MEMBER_ROLES = Object.values(PROJECT_MEMBER_ROLE);

export class ListProjectsQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: ProjectStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Only projects you are a member, manager or lead of' })
  @IsOptional()
  @IsBoolean()
  mine?: boolean;
}

export class ProjectMemberInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: MEMBER_ROLES })
  @IsIn(MEMBER_ROLES)
  role!: ProjectMemberRole;

  /**
   * What this person is responsible for here. Free-form so a team can use its own words;
   * `WORK_AREAS` is only what the UI suggests. Normalised on the way in so that "api", "API " and
   * "Api" become one responsibility rather than three the router would treat as unrelated.
   */
  @ApiPropertyOptional({
    isArray: true,
    type: String,
    example: ['Frontend', 'API'],
    description: `Suggestions: ${WORK_AREAS.join(', ')}. Any other value is accepted.`,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(WORK_AREA_MAX_LENGTH, { each: true })
  @ArrayMaxSize(MAX_WORK_AREAS)
  @Transform(({ value }) => (Array.isArray(value) ? normalizeWorkAreas(value as string[]) : value))
  responsibilities?: string[];
}

export class CreateProjectDto {
  @ApiProperty({ example: 'ACM', description: 'Short code used as the task-number prefix' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z][A-Z0-9]{1,7}$/, { message: 'code must be 2–8 letters or digits' })
  code!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES)
  type!: ProjectType;

  @ApiPropertyOptional({ enum: STATUSES, default: PROJECT_STATUS.ACTIVE })
  @IsOptional()
  @IsIn(STATUSES)
  status?: ProjectStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Client the work is for; omit for internal projects',
  })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  managerUserId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadUserId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  teamId?: string | null;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  targetDate?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresClientUat?: boolean;

  @ApiPropertyOptional({ type: [ProjectMemberInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProjectMemberInputDto)
  members?: ProjectMemberInputDto[];
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsIn(TYPES)
  type?: ProjectType;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: ProjectStatus;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  managerUserId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  leadUserId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  teamId?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  targetDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresClientUat?: boolean;
}

export class SetProjectMembersDto {
  @ApiProperty({ type: [ProjectMemberInputDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProjectMemberInputDto)
  members!: ProjectMemberInputDto[];
}
