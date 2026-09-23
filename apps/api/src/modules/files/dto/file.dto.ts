import { ApiPropertyOptional } from '@nestjs/swagger';
import { VISIBILITY, type Visibility } from '@ashniva/types';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Multipart fields sent alongside the `file` part. */
export class UploadFileDto {
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
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Contract document' })
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  milestoneId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  changeRequestId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  approvalId?: string;

  @ApiPropertyOptional({ enum: Object.values(VISIBILITY), default: VISIBILITY.INTERNAL })
  @IsOptional()
  @IsIn(Object.values(VISIBILITY))
  visibility?: Visibility;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Short note on what this attachment is for',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}

/**
 * Every field is still optional individually, because a caller names exactly one of them. The
 * service refuses a query that names none: a bare `GET /files` used to answer with every
 * attachment in the installation, and "no filter" is never what a caller of an attachment list
 * means.
 */
export class ListFilesQueryDto {
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
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  milestoneId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  changeRequestId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  approvalId?: string;
}
