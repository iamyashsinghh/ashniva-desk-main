import { Switch, View } from 'react-native';

import { AppText } from '../../../shared/components/primitives';
import { TOUCH_TARGET } from '../../../shared/theme/theme';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * One on/off setting with the sentence that says what "off" does.
 *
 * The description is not decoration: most of these switches stop something working for somebody
 * else — a product's credentials, a whole tier's ingress — and the web states the consequence
 * beside each one. A bare label on a phone would make the same decision with less information.
 */
export function SettingSwitch({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET + 4,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="medium">{label}</AppText>
        {description ? (
          <AppText size="xs" tone="muted">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={description}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
        value={value}
      />
    </View>
  );
}
