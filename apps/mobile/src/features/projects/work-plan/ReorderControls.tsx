import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '../../../shared/components/Icon';
import { DISABLED_OPACITY } from '../../../shared/theme/theme';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * Move up, move down, remove — the phone's stand-in for the web's drag handles.
 *
 * Buttons rather than drag, because a drag inside a scrolling list fights the scroll, and needs a
 * gesture library the app does not ship. Each carries the name of what it moves for a screen reader.
 */
export function ReorderControls({
  name,
  index,
  count,
  onMove,
  onRemove,
}: {
  /** What is being moved, e.g. "step 2" or "phase Onboarding". */
  name: string;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      <IconButton
        icon="arrow-up"
        label={`Move ${name} up`}
        disabled={index === 0}
        onPress={() => onMove(-1)}
      />
      <IconButton
        icon="arrow-down"
        label={`Move ${name} down`}
        disabled={index >= count - 1}
        onPress={() => onMove(1)}
      />
      <IconButton
        icon="trash-outline"
        label={`Remove ${name}`}
        color={theme.colors.danger}
        onPress={onRemove}
      />
    </View>
  );
}

function IconButton({
  icon,
  label,
  disabled = false,
  color,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  color?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
        borderRadius: theme.radius.sm,
        height: 36,
        justifyContent: 'center',
        opacity: disabled ? DISABLED_OPACITY : 1,
        width: 36,
      })}
    >
      <Icon name={icon} size={18} color={color ?? theme.colors.textMuted} />
    </Pressable>
  );
}
