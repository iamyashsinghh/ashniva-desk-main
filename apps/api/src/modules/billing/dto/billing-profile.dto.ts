import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { type TaxTreatment } from '@ashniva/types';
import {
  IsBoolean,
  IsEmail,
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
} from 'class-validator';

import { GSTIN, MONEY, PAN, STATE_CODE, TREATMENTS } from './validation';

export class SaveBillingProfileDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  addressLine1!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ maxLength: 100, example: 'Karnataka' })
  @IsString()
  @MaxLength(100)
  state!: string;

  @ApiProperty({ example: '29', description: 'Two-digit GST state code' })
  @Matches(STATE_CODE, { message: 'stateCode must be two digits' })
  stateCode!: string;

  @ApiProperty({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  postalCode!: string;

  @ApiPropertyOptional({ default: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: '29AABCU9603R1ZM' })
  @IsOptional()
  @Matches(GSTIN, { message: 'gstin is not a valid GST identification number' })
  gstin?: string;

  @ApiPropertyOptional({ example: 'AABCU9603R' })
  @IsOptional()
  @Matches(PAN, { message: 'pan is not a valid PAN' })
  pan?: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /**
   * INR only, and refused rather than accepted-and-mishandled.
   *
   * Every invoice takes its currency from here, and the amount in words that legally states the
   * figure is written in the Indian system — lakh, crore, and "Paise" for the subunit. A profile
   * saved as USD printed "Rupees One Hundred and Fifty Paise Only" on a dollar invoice. The rest
   * of the module is India-specific too (GSTIN, two-digit state codes, HSN/SAC, CGST/SGST/IGST),
   * so the honest boundary is to refuse the value until the words and the tax treatment support
   * it, not to store a code that only reaches the total line.
   */
  @ApiPropertyOptional({ default: 'INR', enum: ['INR'] })
  @IsOptional()
  @IsIn(['INR'], {
    message: 'currency must be INR; invoices are numbered, taxed and worded for India only',
  })
  currency?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 365, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;

  @ApiPropertyOptional({ example: '18.00' })
  @IsOptional()
  @IsString()
  @Matches(MONEY)
  defaultTaxRate?: string;

  @ApiPropertyOptional({ enum: TREATMENTS })
  @IsOptional()
  @IsIn(TREATMENTS)
  defaultTaxTreatment?: TaxTreatment;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  roundTotals?: boolean;

  @ApiPropertyOptional({ maxLength: 10, example: 'INV' })
  @IsOptional()
  @Matches(/^[A-Z0-9-]{1,10}$/, { message: 'invoicePrefix may use capitals, digits and dashes' })
  invoicePrefix?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, default: 4, description: '4 = April' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  financialYearStartMonth?: number;

  /**
   * Stored, but printed nowhere yet.
   *
   * The column and this field are kept so the value a tenant has already set is not lost, but no
   * document reads either id — see the note on `InvoicePdfService`. Neither id is validated
   * against the organization's files here, so nothing may render one without resolving it through
   * the organization-scoped file lookup first.
   */
  @ApiPropertyOptional({ format: 'uuid', description: 'Stored; not printed on any document yet' })
  @IsOptional()
  @IsUUID()
  logoFileId?: string;

  /** Stored; not printed on any document yet. See `logoFileId`. */
  @ApiPropertyOptional({ format: 'uuid', description: 'Stored; not printed on any document yet' })
  @IsOptional()
  @IsUUID()
  signatureFileId?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bankDetails?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  terms?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Never printed or sent to a client' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;
}
