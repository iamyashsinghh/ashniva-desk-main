import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { MAX_ORIGIN_LENGTH } from '@ashniva/types';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { RaiseSupportTicketDto } from './support-ingress.dto';

/** What a customer's backend sends to open support for one of its users. */
export class MintWidgetSessionDto {
  @ApiProperty({ description: 'Your identifier for the person the widget is being opened for' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  externalUserId!: string;

  @ApiProperty({
    example: 'https://app.example.com',
    description: 'The exact browser origin the widget will run on; must be registered',
  })
  @IsString()
  @MaxLength(MAX_ORIGIN_LENGTH)
  origin!: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

/**
 * What the widget may send.
 *
 * The ingress request minus the fields a browser must not be able to choose: who reported this,
 * and what their name, email and telephone number are. Those come from the session token, which
 * the customer's backend minted for one identified person. A widget that could name its own
 * requester could file tickets as anybody the customer supports, and could rewrite that person's
 * contact details on the way through.
 *
 * Omitted rather than ignored, so sending one is a 400 with the reason rather than a silently
 * discarded field: `forbidNonWhitelisted` refuses any property this class does not declare.
 */
export class RaiseWidgetTicketDto extends OmitType(RaiseSupportTicketDto, [
  'externalUserId',
  'requesterName',
  'requesterEmail',
  'requesterPhone',
] as const) {}
