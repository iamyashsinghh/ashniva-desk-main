import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MESSAGE_TEMPLATE, type MessageTemplate } from '@ashniva/types';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const TEMPLATES = Object.values(MESSAGE_TEMPLATE);

/** Digits, with an optional leading plus. Meta rejects anything else anyway. */
const PHONE_PATTERN = /^\+?[1-9]\d{6,14}$/;
const GRAPH_ID_PATTERN = /^\d{5,25}$/;

export class SaveWhatsAppSettingsDto {
  @ApiProperty({ example: '102290129340398', description: 'WhatsApp Business Account id' })
  @Matches(GRAPH_ID_PATTERN, { message: 'businessAccountId must be a numeric Meta id' })
  businessAccountId!: string;

  @ApiProperty({ example: '106540352242922', description: 'Phone number id, not the number' })
  @Matches(GRAPH_ID_PATTERN, { message: 'phoneNumberId must be a numeric Meta id' })
  phoneNumberId!: string;

  @ApiPropertyOptional({ example: '+441234567890', description: 'Shown in the UI only' })
  @IsOptional()
  @Matches(PHONE_PATTERN)
  displayPhoneNumber?: string;

  @ApiPropertyOptional({
    maxLength: 255,
    description:
      'Echoed back during Meta’s subscription handshake. Omitted on an edit: the stored one is kept.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  verifyToken?: string;

  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Signs inbound webhooks. Never returned by any endpoint.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  appSecret?: string;

  @ApiPropertyOptional({ example: 'v21.0' })
  @IsOptional()
  @Matches(/^v\d{1,3}\.\d{1,3}$/, { message: 'apiVersion must look like v21.0' })
  apiVersion?: string;

  @ApiPropertyOptional({
    description: 'Our template key to the name approved in your WhatsApp Business account',
    example: { TASK_ASSIGNED: 'task_assigned_v1' },
  })
  @IsOptional()
  @IsObject()
  templateNames?: Partial<Record<MessageTemplate, string>>;

  @ApiPropertyOptional({ example: 'en', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  templateLanguage?: string;

  @ApiPropertyOptional({
    maxLength: 512,
    description: 'Leave out to keep the stored token. Never returned by any endpoint.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  accessToken?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class SendWhatsAppTestDto {
  @ApiProperty({ enum: TEMPLATES, example: 'TASK_ASSIGNED' })
  @IsIn(TEMPLATES)
  template!: MessageTemplate;

  @ApiProperty({ example: '+441234567890', description: 'The number to send the test to' })
  @Matches(PHONE_PATTERN, { message: 'toPhone must be a valid international number' })
  toPhone!: string;
}
