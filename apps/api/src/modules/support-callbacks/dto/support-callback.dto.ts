import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORT_CALLBACK_EVENTS, type SupportCallbackEvent } from '@ashniva/types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const EVENTS = [...SUPPORT_CALLBACK_EVENTS];

export class UpsertCallbackEndpointDto {
  /**
   * HTTPS only, enforced twice: here so the message is about the scheme, and again by
   * `SafeHttpService.check` at save time so the address it resolves to is judged as well.
   */
  @ApiProperty({ example: 'https://hooks.example.com/ashniva' })
  @IsString()
  @MaxLength(2000)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  url!: string;

  @ApiPropertyOptional({ isArray: true, enum: EVENTS, description: 'Empty means every event' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(EVENTS, { each: true })
  events?: SupportCallbackEvent[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CallbackDeliveryQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'The id of the last row of the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}
