import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EMAIL_ENCRYPTION, type EmailEncryption } from '@ashniva/types';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const ENCRYPTIONS = Object.values(EMAIL_ENCRYPTION);

export class SaveEmailSettingsDto {
  @ApiProperty({ maxLength: 100, example: 'Ashniva Desk' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  senderName!: string;

  @ApiProperty({ example: 'noreply@ashniva.example' })
  @IsEmail()
  senderEmail!: string;

  @ApiPropertyOptional({ example: 'support@ashniva.example' })
  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @ApiProperty({ maxLength: 255, example: 'smtp.example.com' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  host!: string;

  @ApiProperty({ minimum: 1, maximum: 65535, example: 587 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  port!: number;

  @ApiProperty({ enum: ENCRYPTIONS })
  @IsIn(ENCRYPTIONS)
  encryption!: EmailEncryption;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string;

  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Leave out to keep the stored password. Never returned by any endpoint.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class MessageHistoryQueryDto {
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
