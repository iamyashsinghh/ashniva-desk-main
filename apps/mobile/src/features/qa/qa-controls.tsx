import { Pressable, Switch, View } from 'react-native';

import { Icon, type IconName } from '../../shared/components/Icon';
import { AppText, Button } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

/** The pinned footer of a QA sheet: back out, or do it. */
export function SheetFooter({
  confirmLabel,
  confirmIcon,
  onConfirm,
  onCancel,
  busy,
  disabled = false,
  danger = false,
  cancelLabel = 'Back',
}: {
  confirmLabel: string;
  confirmIcon: IconName;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  disabled?: boolean;
  danger?: boolean;
  cancelLabel?: string;
}) {
  return (
    <>
      <Button label={cancelLabel} variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
      <Button
        label={confirmLabel}
        icon={confirmIcon}
        variant={danger ? 'danger' : 'primary'}
        loading={busy}
        disabled={disabled}
        onPress={onConfirm}
        style={{ flex: 1 }}
      />
    </>
  );
}

/** A switch with what it does spelled out beside it. */
export function SwitchRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
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
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="medium">{label}</AppText>
        <AppText size="xs" tone="muted">
          {description}
        </AppText>
      </View>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
        value={value}
      />
    </View>
  );
}

/** One line of a checklist: the whole row is the target, because a thumb is not a cursor. */
export function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={({ pressed }) => ({
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? theme.colors.success : theme.colors.textMuted}
      />
      <AppText size="sm" style={{ flex: 1 }}>
        {label}
      </AppText>
    </Pressable>
  );
}
