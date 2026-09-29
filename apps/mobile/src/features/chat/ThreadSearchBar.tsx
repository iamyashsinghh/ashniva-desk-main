import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { AppText, Input } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * Searching the thread that is open.
 *
 * Over the messages already loaded, as on the web — the endpoint has no search, and saying how
 * many are "in view" is what keeps an empty result from reading as a broken one.
 */
export function ThreadSearchBar({
  value,
  onChange,
  matches,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  matches: number;
  onClose?: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.screen,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <View style={{ flex: 1 }}>
        <Input
          accessibilityLabel="Search this conversation"
          placeholder="Search this conversation"
          icon="search-outline"
          value={value}
          onChangeText={onChange}
          autoFocus
        />
      </View>
      {value.trim().length > 0 ? (
        <View accessibilityLiveRegion="polite">
          <AppText size="xs" tone="muted">
            {matches} in view
          </AppText>
        </View>
      ) : null}
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the search"
          onPress={onClose}
          style={({ pressed }) => ({
            alignItems: 'center',
            height: TOUCH_TARGET,
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
            width: TOUCH_TARGET,
          })}
        >
          <Icon name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
