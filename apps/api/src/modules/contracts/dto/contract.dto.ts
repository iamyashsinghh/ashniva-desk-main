import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BILLING_PERIOD,
  CARRY_FORWARD_RULE,
  CONTRACT_LIST_VIEW,
  CONTRACT_STATUS,
  CONTRACT_TYPE,
  type BillingPeriod,
  type CarryForwardRule,
  type ContractListView,
  type ContractStatus,
  type ContractType,
} from '@ashniva/types';
import {
  IsBoolean,
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

export class ListContractsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(CONTRACT_LIST_VIEW),
    default: CONTRACT_LIST_VIEW.ACTIVE,
  })
  @IsOptional()
  @IsIn(Object.values(CONTRACT_LIST_VIEW))
  view?: ContractListView;

  @ApiPropertyOptional({ enum: Object.values(CONTRACT_TYPE) })
  @IsOptional()
  @IsIn(Object.values(CONTRACT_TYPE))
  type?: ContractType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientOrganizationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Matches number, title or client name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CreateContractDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientOrganizationId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ enum: Object.values(CONTRACT_TYPE) })
  @IsIn(Object.values(CONTRACT_TYPE))
  type!: ContractType;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 10000, description: 'Scope of work (client-visible)' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  scope?: string;

  @ApiPropertyOptional({ enum: Object.values(CONTRACT_STATUS), default: CONTRACT_STATUS.DRAFT })
  @IsOptional()
  @IsIn([CONTRACT_STATUS.DRAFT, CONTRACT_STATUS.ACTIVE])
  status?: ContractStatus;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  renewalDate?: string | null;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  renewalNoticeDays?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @ApiPropertyOptional({ default: 'INR', maxLength: 3 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Decimal as a string, e.g. "250000.00"', nullable: true })
  @IsOptional()
  @IsNumberString()
  contractValue?: string | null;

  @ApiPropertyOptional({
    description: 'Internal cost estimate (cost:read); decimal string',
    nullable: true,
  })
  @IsOptional()
  @IsNumberString()
  internalCost?: string | null;

  @ApiPropertyOptional({
    default: 0,
    description: 'Hours per billing period × 60; 0 = no hour tracking',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  includedMinutesPerPeriod?: number;

  @ApiPropertyOptional({ enum: Object.values(BILLING_PERIOD), default: BILLING_PERIOD.MONTHLY })
  @IsOptional()
  @IsIn(Object.values(BILLING_PERIOD))
  billingPeriod?: BillingPeriod;

  @ApiPropertyOptional({
    enum: Object.values(CARRY_FORWARD_RULE),
    default: CARRY_FORWARD_RULE.NONE,
  })
  @IsOptional()
  @IsIn(Object.values(CARRY_FORWARD_RULE))
  carryForwardRule?: CarryForwardRule;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  carryForwardCapMinutes?: number | null;

  @ApiPropertyOptional({ default: 300 })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowHoursThresholdMinutes?: number;

  @ApiPropertyOptional({ maxLength: 10000, description: 'Internal only' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  internalNotes?: string;

  @ApiPropertyOptional({ maxLength: 5000, description: 'Shown to the client' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  clientNotes?: string;
}

export class UpdateContractDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ enum: Object.values(CONTRACT_TYPE) })
  @IsOptional()
  @IsIn(Object.values(CONTRACT_TYPE))
  type?: ContractType;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 10000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  scope?: string | null;

  @ApiPropertyOptional({
    enum: [CONTRACT_STATUS.DRAFT, CONTRACT_STATUS.ACTIVE, CONTRACT_STATUS.EXPIRED],
  })
  @IsOptional()
  @IsIn([CONTRACT_STATUS.DRAFT, CONTRACT_STATUS.ACTIVE, CONTRACT_STATUS.EXPIRED])
  status?: ContractStatus;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsDateString()
  renewalDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  renewalNoticeDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @ApiPropertyOptional({ maxLength: 3 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumberString()
  contractValue?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumberString()
  internalCost?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  includedMinutesPerPeriod?: number;

  @ApiPropertyOptional({ enum: Object.values(BILLING_PERIOD) })
  @IsOptional()
  @IsIn(Object.values(BILLING_PERIOD))
  billingPeriod?: BillingPeriod;

  @ApiPropertyOptional({ enum: Object.values(CARRY_FORWARD_RULE) })
  @IsOptional()
  @IsIn(Object.values(CARRY_FORWARD_RULE))
  carryForwardRule?: CarryForwardRule;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  carryForwardCapMinutes?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  lowHoursThresholdMinutes?: number;

  @ApiPropertyOptional({ maxLength: 10000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  internalNotes?: string | null;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  clientNotes?: string | null;
}
