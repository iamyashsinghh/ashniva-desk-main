import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
  type NotificationChannel,
  type NotificationType,
} from '@ashniva/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { IsTimezone } from '../../sla-escalations/dto/is-timezone';

const TYPES = Object.values(NOTIFICATION_TYPE);
const CHANNELS = Object.values(NOTIFICATION_CHANNEL);
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only unread' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unread?: boolean;
}

export class NotificationPreferenceEntryDto {
  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES)
  type!: NotificationType;

  @ApiProperty({ enum: CHANNELS })
  @IsIn(CHANNELS)
  channel!: NotificationChannel;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ type: [NotificationPreferenceEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceEntryDto)
  entries?: NotificationPreferenceEntryDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @Matches(CLOCK, { message: 'quietHoursStart must be HH:MM' })
  quietHoursStart?: string;

  @ApiPropertyOptional({ example: '07:00' })
  @IsOptional()
  @Matches(CLOCK, { message: 'quietHoursEnd must be HH:MM' })
  quietHoursEnd?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsTimezone()
  timezone?: string;
}
