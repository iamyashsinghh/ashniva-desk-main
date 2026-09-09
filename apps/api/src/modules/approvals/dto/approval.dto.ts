import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  APPROVAL_LIST_VIEW,
  APPROVAL_STATUS,
  APPROVAL_SUBJECT_TYPE,
  type ApprovalListView,
  type ApprovalStatus,
  type ApprovalSubjectType,
} from '@ashniva/types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const STATUSES = Object.values(APPROVAL_STATUS);
const SUBJECTS = Object.values(APPROVAL_SUBJECT_TYPE);
const VIEWS = Object.values(APPROVAL_LIST_VIEW);

const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

export class ListApprovalsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: VIEWS, default: APPROVAL_LIST_VIEW.INBOX })
  @IsOptional()
  @IsIn(VIEWS)
  view?: ApprovalListView;

  @ApiPropertyOptional({ enum: STATUSES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(STATUSES, { each: true })
  status?: ApprovalStatus[];

  @ApiPropertyOptional({ enum: SUBJECTS })
  @IsOptional()
  @IsIn(SUBJECTS)
  subjectType?: ApprovalSubjectType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CreateApprovalDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ maxLength: 5000, description: 'Client-visible description of what to approve' })
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  summary!: string;

  @ApiProperty({ enum: SUBJECTS })
  @IsIn(SUBJECTS)
  subjectType!: ApprovalSubjectType;

  @ApiProperty({ format: 'uuid', description: 'Id of the update, milestone, file or CR' })
  @IsUUID()
  subjectId!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true, description: 'Never shown to clients' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Files you uploaded, to attach' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  fileIds?: string[];
}

export class UpdateApprovalDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  summary?: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string | null;
}

export class ApprovalCommentDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ApprovalDecisionDto {
  @ApiProperty({ maxLength: 2000, description: 'Required when requesting changes or rejecting' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  comment!: string;
}
