import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { GSTIN, STATE_CODE } from './validation';

/**
 * The "Bill to" particulars of one client, as the provider records them.
 *
 * The client organization is named in the path, not the body: the row is identified by the pair
 * (provider, client) and a body that could also carry a client id is a body that can disagree
 * with the URL it was sent to.
 *
 * Deliberately not here: any tax setting. What a client is charged is decided by the invoice's
 * own place of supply against the supplier's state code, and a second copy of that decision on
 * the recipient's record is a second copy that can drift from the first.
 */
export class SaveClientBillingProfileDto {
  @ApiProperty({ maxLength: 200, description: 'The registered name to print on the invoice' })
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

  @ApiProperty({ maxLength: 100, example: 'Maharashtra' })
  @IsString()
  @MaxLength(100)
  state!: string;

  @ApiProperty({
    example: '27',
    description: 'Two-digit GST state code of the recipient. Printed; it sets no tax treatment.',
  })
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

  @ApiPropertyOptional({
    example: '27AABCU9603R1ZM',
    description: 'Omit for an unregistered recipient, who has none',
  })
  @IsOptional()
  @Matches(GSTIN, { message: 'gstin is not a valid GST identification number' })
  gstin?: string;
}
