import { ApiPropertyOptional } from '@nestjs/swagger';
import { CLIENT_UPDATE_STATUS, type ClientUpdateStatus } from '@ashniva/types';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const STATUSES = Object.values(CLIENT_UPDATE_STATUS);

export class ListClientUpdatesQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: ClientUpdateStatus;

  @ApiPropertyOptional({ format: 'date', description: 'Work date' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;
}

export class EditClientUpdateDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body?: string;
}
