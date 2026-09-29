import { ApiProperty } from '@nestjs/swagger';
import { AVATAR_PRESETS, type AvatarPreset, type SetAvatarPresetInput } from '@ashniva/types';
import { IsIn } from 'class-validator';

export class SetAvatarPresetDto implements SetAvatarPresetInput {
  @ApiProperty({ enum: AVATAR_PRESETS })
  @IsIn(AVATAR_PRESETS)
  preset!: AvatarPreset;
}
