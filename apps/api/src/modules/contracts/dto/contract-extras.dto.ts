import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  HOUR_LEDGER_KIND,
  PAYMENT_MILESTONE_STATUS,
  type HourLedgerKind,
  type PaymentMilestoneStatus,
} from '@ashniva/types';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const MANUAL_KINDS = [
  HOUR_LEDGER_KIND.PURCHASED,
  HOUR_LEDGER_KIND.ADJUSTMENT,
  HOUR_LEDGER_KIND.RESERVED,
  HOUR_LEDGER_KIND.RELEASED,
] as const;

export class HourMovementDto {
  @ApiProperty({ enum: MANUAL_KINDS })
  @IsIn(MANUAL_KINDS)
  kind!: HourLedgerKind;

  @ApiProperty({ description: 'Minutes; sign is derived from the kind (ADJUSTMENT keeps yours)' })
  @IsInt()
  @Min(-600_000)
  @Max(600_000)
  minutes!: number;

  @ApiProperty({ maxLength: 500, description: 'Mandatory for every manual movement' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Makes a retried request a no-op' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ticketId?: string;
}

export class LedgerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'date', description: 'Only the period starting on this date' })
  @IsOptional()
  @IsDateString()
  periodStart?: string;
}

export class PaymentMilestoneDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'Decimal string' })
  @IsNumberString()
  amount!: string;

  @ApiPropertyOptional({ maxLength: 3 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  milestoneId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdatePaymentMilestoneDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  amount?: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ enum: Object.values(PAYMENT_MILESTONE_STATUS) })
  @IsOptional()
  @IsIn(Object.values(PAYMENT_MILESTONE_STATUS))
  status?: PaymentMilestoneStatus;

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceReference?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  milestoneId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
