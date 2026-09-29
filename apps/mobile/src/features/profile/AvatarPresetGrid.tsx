import type { AvatarPreset, SessionUser } from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { AVATAR_PRESET_STYLES, AVATAR_PRESETS } from '../../shared/components/avatar-presets';
import { PersonAvatar } from '../../shared/components/PersonAvatar';
import { AppText } from '../../shared/components/primitives';
import { DISABLED_OPACITY } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

const TILE = 60;

/** The twelve built-in pictures, drawn exactly as they will look on your profile. */
export function AvatarPresetGrid({
  user,
  disabled,
  onChoose,
}: {
  user: SessionUser;
  disabled: boolean;
  onChoose: (preset: AvatarPreset) => void;
}) {
  const theme = useTheme();
  const current = user.avatar?.kind === 'preset' ? user.avatar.preset : null;

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.md,
        justifyContent: 'center',
      }}
    >
      {AVATAR_PRESETS.map((preset) => {
        const selected = preset === current;
        const { label } = AVATAR_PRESET_STYLES[preset];
        return (
          <Pressable
            key={preset}
            accessibilityRole="button"
            accessibilityLabel={`${label} avatar`}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChoose(preset)}
            style={({ pressed }) => ({
              alignItems: 'center',
              gap: theme.spacing.xs,
              opacity: disabled ? DISABLED_OPACITY : pressOpacity(pressed),
              width: TILE + theme.spacing.md,
            })}
          >
            <View
              style={{
                borderColor: selected ? theme.colors.primary : 'transparent',
                borderRadius: (TILE + 8) / 2,
                borderWidth: 2,
                padding: 2,
              }}
            >
              <PersonAvatar
                person={{ id: user.id, name: user.name, avatar: { kind: 'preset', preset } }}
                size={TILE}
              />
            </View>
            <AppText size="xs" tone={selected ? 'primary' : 'muted'} numberOfLines={1}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function pressOpacity(pressed: boolean): number {
  return pressed ? 0.7 : 1;
}
