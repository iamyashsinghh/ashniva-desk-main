import { Pressable, ScrollView, View } from 'react-native';

import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { AppText } from './primitives';

export interface TabOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  count?: number;
}

/**
 * A scrolling row of tabs with an underline, for switching views inside one screen — a project's
 * Overview / Plan / Tasks, a list's "Assigned to me / Created by me".
 *
 * Unlike `Segmented`, it scrolls, so nine views fit without shrinking the labels to nothing.
 */
export function TabBar<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderBottomColor: theme.colors.border,
        borderBottomWidth: 1,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        {...(accessibilityLabel ? { accessibilityLabel } : {})}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.sm }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          const color = selected ? theme.colors.primary : theme.colors.textMuted;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={
                option.count !== undefined ? `${option.label}, ${option.count}` : option.label
              }
              onPress={() => onChange(option.value)}
              style={({ pressed }) => ({
                alignItems: 'center',
                borderBottomColor: selected ? theme.colors.primary : 'transparent',
                borderBottomWidth: 2.5,
                flexDirection: 'row',
                gap: 6,
                minHeight: TOUCH_TARGET + 4,
                opacity: pressed ? 0.7 : 1,
                paddingHorizontal: theme.spacing.md,
              })}
            >
              {option.icon ? <Icon name={option.icon} size={16} color={color} /> : null}
              <AppText size="sm" weight="medium" style={{ color }}>
                {option.label}
              </AppText>
              {option.count !== undefined && option.count > 0 ? (
                <View
                  style={{
                    backgroundColor: selected ? theme.colors.primary : theme.colors.pillBackground,
                    borderRadius: theme.radius.pill,
                    minWidth: 20,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                  }}
                >
                  <AppText
                    size="xs"
                    weight="bold"
                    align="center"
                    tone={selected ? 'inverse' : 'muted'}
                    tabular
                  >
                    {option.count > 99 ? '99+' : option.count}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
