import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_CALL_ATTEMPTS_LIMIT,
  RECORDING_PLAYBACK_SCOPE,
  RECORDING_POLICY,
  SUPPORT_TIER,
  type RecordingPlaybackScope,
  type RecordingPolicy,
  type SupportTier,
} from '@ashniva/types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const POLICIES = Object.values(RECORDING_POLICY);
const SCOPES = Object.values(RECORDING_PLAYBACK_SCOPE);
const TIERS = Object.values(SUPPORT_TIER);

/**
 * Editing a product's calling policy.
 *
 * Every field is optional and a partial save leaves the rest alone, so a screen that only toggles
 * one switch cannot silently reset a recording scope somebody narrowed on purpose. The global
 * `ValidationPipe` runs with `forbidNonWhitelisted`, so a field not declared here is a 400 rather
 * than something quietly ignored.
 */
export class SaveIvrPolicyDto {
  @ApiPropertyOptional({ description: 'Whether this product may raise support calls at all' })
  @IsOptional()
  @IsBoolean()
  ivrEnabled?: boolean;

  @ApiPropertyOptional({ enum: POLICIES })
  @IsOptional()
  @IsIn(POLICIES)
  recordingPolicy?: RecordingPolicy;

  @ApiPropertyOptional({
    enum: SCOPES,
    description: 'Who may play a recording, on top of the call:play-recording permission',
  })
  @IsOptional()
  @IsIn(SCOPES)
  recordingPlaybackScope?: RecordingPlaybackScope;

  @ApiPropertyOptional({
    enum: TIERS,
    isArray: true,
    description: 'Support tiers whose tickets may raise a call. Empty means every tier.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TIERS.length)
  @IsIn(TIERS, { each: true })
  allowedTiers?: SupportTier[];

  @ApiPropertyOptional({
    description: 'Whether the person who raised the ticket may ask for a call themselves',
  })
  @IsOptional()
  @IsBoolean()
  requesterInitiateEnabled?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Where a call goes when the routing chain and escalation both come up empty',
  })
  @IsOptional()
  @IsUUID()
  fallbackUserId?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_CALL_ATTEMPTS_LIMIT })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CALL_ATTEMPTS_LIMIT)
  maxAttempts?: number;
}
