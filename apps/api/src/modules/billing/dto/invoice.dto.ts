import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { type TaxTreatment } from '@ashniva/types';
import {
  ArrayMaxSize,
  ArrayMinSize,
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

import { MONEY, STATE_CODE, TREATMENTS } from './validation';

export class InvoiceLineDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional({ maxLength: 20, example: '998314' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsnSac?: string;

  @ApiProperty({ example: '1.000', description: 'Sent as a string; a JSON number loses precision' })
  @IsString()
  @Matches(MONEY, { message: 'quantity must be a decimal string' })
  quantity!: string;

  @ApiPropertyOptional({ default: 'Nos', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiProperty({ example: '1000.00' })
  @IsString()
  @Matches(MONEY, { message: 'unitPrice must be a decimal string' })
  unitPrice!: string;

  @ApiPropertyOptional({ example: '10.00' })
  @IsOptional()
  @IsString()
  @Matches(MONEY)
  discountPercent?: string;

  @ApiPropertyOptional({ example: '250.00' })
  @IsOptional()
  @IsString()
  @Matches(MONEY)
  discountAmount?: string;

  @ApiPropertyOptional({ example: '18.00', description: 'Defaults to the profile rate' })
  @IsOptional()
  @IsString()
  @Matches(MONEY)
  taxRate?: string;
}

export class CreateInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientOrganizationId!: string;

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

  @ApiProperty({ format: 'date' })
  @IsDateString()
  issueDate!: string;

  @ApiPropertyOptional({ format: 'date', description: 'Defaults to the profile payment terms' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ maxLength: 100, example: 'Maharashtra' })
  @IsString()
  @MaxLength(100)
  placeOfSupplyState!: string;

  @ApiProperty({ example: '27' })
  @Matches(STATE_CODE, { message: 'placeOfSupplyCode must be two digits' })
  placeOfSupplyCode!: string;

  @ApiPropertyOptional({ enum: TREATMENTS })
  @IsOptional()
  @IsIn(TREATMENTS)
  taxTreatment?: TaxTreatment;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  reverseCharge?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isExport?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isExempt?: boolean;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Printed on the invoice' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Never printed or sent to a client' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;

  @ApiProperty({ type: [InvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}

/** Everything on create is optional here; lines given replace the draft's lines wholesale. */
export class UpdateInvoiceDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  placeOfSupplyState?: string;

  @ApiPropertyOptional({ example: '27' })
  @IsOptional()
  @Matches(STATE_CODE)
  placeOfSupplyCode?: string;

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

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;

  @ApiPropertyOptional({ type: [InvoiceLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines?: InvoiceLineDto[];
}
