import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { type PaymentMethod } from '@ashniva/types';
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

import { METHODS, MONEY } from './validation';

export class AllocationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  invoiceId!: string;

  @ApiProperty({ example: '1180.00' })
  @IsString()
  @Matches(MONEY, { message: 'amount must be a decimal string' })
  amount!: string;
}

export class RecordPaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientOrganizationId!: string;

  @ApiProperty({ maxLength: 100, description: 'Unique per organization; stops a double entry' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  reference!: string;

  @ApiProperty({ enum: METHODS })
  @IsIn(METHODS)
  method!: PaymentMethod;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  paidAt!: string;

  @ApiProperty({ example: '1180.00' })
  @IsString()
  @Matches(MONEY, { message: 'amount must be a decimal string' })
  amount!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Never sent to a client' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;

  @ApiPropertyOptional({
    type: [AllocationDto],
    description: 'Leave out to settle open invoices oldest first',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];

  @ApiPropertyOptional({ default: false, description: 'Record the money without applying it' })
  @IsOptional()
  @IsBoolean()
  leaveUnallocated?: boolean;
}

export class AllocatePaymentDto {
  @ApiProperty({ type: [AllocationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];
}

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

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
