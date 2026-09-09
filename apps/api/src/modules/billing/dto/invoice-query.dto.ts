import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { type InvoiceStatus, type TaxTreatment } from '@ashniva/types';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { InvoiceLineDto } from './invoice.dto';
import { STATE_CODE, STATUSES, TREATMENTS, toArray } from './validation';

export class CalculatePreviewDto {
  @ApiProperty({ type: [InvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];

  @ApiProperty({ example: '27' })
  @Matches(STATE_CODE)
  placeOfSupplyCode!: string;

  @ApiPropertyOptional({ enum: TREATMENTS })
  @IsOptional()
  @IsIn(TREATMENTS)
  taxTreatment?: TaxTreatment;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reverseCharge?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isExport?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isExempt?: boolean;
}

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({ enum: STATUSES, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(STATUSES, { each: true })
  status?: InvoiceStatus[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Invoice number or client name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  issuedFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  issuedTo?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class InvoiceReasonDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
