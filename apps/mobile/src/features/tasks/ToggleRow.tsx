import { Switch, View } from 'react-native';

import { IconTile, type IconName } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * A switch with its consequence spelled out beside it. Used wherever the client may end up
 * reading something — somebody flipping it on a train should know that is what it does.
 */
export function ToggleRow({
  label,
  description,
  value,
  onChange,
  icon = 'eye-outline',
  disabled = false,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  icon?: IconName;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET,
      }}
    >
      <IconTile name={icon} tone={value ? 'info' : 'neutral'} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="medium">{label}</AppText>
        <AppText size="xs" tone="muted">
          {description}
        </AppText>
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
        value={value}
      />
    </View>
  );
}
