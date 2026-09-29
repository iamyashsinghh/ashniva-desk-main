import { Switch, View } from 'react-native';

import { AppText } from '../../../shared/components/primitives';
import { TOUCH_TARGET } from '../../../shared/theme/theme';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * A labelled switch with what it does spelled out. The label is the switch's accessible name, so
 * a screen reader hears "Show Development section, switch, on" rather than an anonymous toggle.
 */
export function SwitchRow({
  label,
  description,
  value,
  onChange,
  disabled = false,
  detail,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** A faint third line, such as the permission key the API and audit log use. */
  detail?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="medium" tone={disabled && !value ? 'muted' : 'default'}>
          {label}
        </AppText>
        {description ? (
          <AppText size="xs" tone="muted">
            {description}
          </AppText>
        ) : null}
        {detail ? (
          <AppText size="xs" tone="faint">
            {detail}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityState={{ disabled, checked: value }}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
        value={value}
      />
    </View>
  );
}
