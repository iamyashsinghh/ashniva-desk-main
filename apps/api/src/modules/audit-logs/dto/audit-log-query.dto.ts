import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'task' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  entityType?: string;

  @ApiPropertyOptional({ example: 'task.status_changed' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Matches the action or entity id' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
