import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_TYPE_LABELS,
  type NotificationChannel,
  type NotificationType,
} from '@ashniva/types';
import { Switch, View } from 'react-native';

import { IconTile, type IconName } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { PREFERENCE_CHANNELS } from './preference-options';

/** Wide enough for a switch and a two-line channel name above it. */
const CHANNEL_COLUMN = 76;

function ThemedSwitch({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <Switch
      accessibilityLabel={label}
      disabled={disabled}
      onValueChange={onChange}
      trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
      value={value}
    />
  );
}

/** The channel names over the switch columns, once per group. */
export function ChannelHeader() {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', gap: theme.spacing.xs }}
    >
      <View style={{ flex: 1 }} />
      {PREFERENCE_CHANNELS.map((channel) => (
        <View key={channel} style={{ alignItems: 'center', width: CHANNEL_COLUMN }}>
          <AppText size="xs" tone="faint" align="center" numberOfLines={2}>
            {NOTIFICATION_CHANNEL_LABELS[channel]}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** One kind of notification, with a switch per channel that delivers. */
export function TypeRow({
  type,
  isOn,
  disabled,
  onChange,
}: {
  type: NotificationType;
  isOn: (channel: NotificationChannel) => boolean;
  disabled: boolean;
  onChange: (channel: NotificationChannel, enabled: boolean) => void;
}) {
  const theme = useTheme();
  const label = NOTIFICATION_TYPE_LABELS[type];
  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.xs,
        minHeight: TOUCH_TARGET + 4,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText size="sm">{label}</AppText>
      </View>
      {PREFERENCE_CHANNELS.map((channel) => (
        <View key={channel} style={{ alignItems: 'center', width: CHANNEL_COLUMN }}>
          <ThemedSwitch
            label={`${label} via ${NOTIFICATION_CHANNEL_LABELS[channel]}`}
            value={isOn(channel)}
            disabled={disabled}
            onChange={(next) => onChange(channel, next)}
          />
        </View>
      ))}
    </View>
  );
}

/** A labelled on/off setting that is not per channel — quiet hours. */
export function SwitchRow({
  label,
  value,
  disabled,
  onChange,
  icon,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  icon?: IconName;
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
      {icon ? <IconTile name={icon} tone="violet" size={36} /> : null}
      <View style={{ flex: 1 }}>
        <AppText>{label}</AppText>
      </View>
      <ThemedSwitch label={label} value={value} disabled={disabled} onChange={onChange} />
    </View>
  );
}
