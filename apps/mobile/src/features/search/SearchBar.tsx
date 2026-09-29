import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../shared/components/Icon';
import { Input } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * The search screen's own top bar: back, and the field.
 *
 * Drawn here rather than as a stack header because the field *is* the header — a title reading
 * "Search" above a box that says "Search" is a line of the screen spent saying nothing.
 */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  onBack,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  /** A new answer is on its way while the previous one is still showing. */
  busy: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        gap: theme.spacing.xs,
        paddingBottom: theme.spacing.sm,
        paddingRight: theme.spacing.screen,
        paddingTop: insets.top + theme.spacing.sm,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={({ pressed }) => ({
          alignItems: 'center',
          height: TOUCH_TARGET,
          justifyContent: 'center',
          marginLeft: theme.spacing.xs,
          opacity: pressed ? 0.6 : 1,
          width: TOUCH_TARGET,
        })}
      >
        <Icon name="chevron-back" size={26} color={theme.colors.primary} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Input
          accessibilityLabel="Search"
          placeholder="Search everything you can see"
          icon="search-outline"
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
          right={
            busy || value.length > 0 ? (
              <View style={{ alignItems: 'center', flexDirection: 'row' }}>
                {busy ? <ActivityIndicator size="small" color={theme.colors.textFaint} /> : null}
                {value.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear the search"
                    onPress={() => onChange('')}
                    style={({ pressed }) => ({
                      alignItems: 'center',
                      height: TOUCH_TARGET,
                      justifyContent: 'center',
                      opacity: pressed ? 0.6 : 1,
                      width: TOUCH_TARGET - 8,
                    })}
                  >
                    <Icon name="close-circle" size={20} color={theme.colors.textFaint} />
                  </Pressable>
                ) : null}
              </View>
            ) : undefined
          }
        />
      </View>
    </View>
  );
}
