import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { AppText, Button, Input } from './primitives';
import { Sheet } from './Sheet';

/**
 * The search box and "Filters" button above a list, and the sheet the button opens.
 *
 * The filters themselves are the caller's — a status list, a project, a priority — passed as
 * children; this owns only the frame and the count of filters in force, which is shown on the
 * button so a list that looks short explains itself.
 */

/** Waits for a pause in typing before searching, so each keystroke is not a request. */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export function SearchFilterBar({
  search,
  onSearch,
  placeholder = 'Search',
  activeFilters = 0,
  onOpenFilters,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  activeFilters?: number;
  /** Leave out when the list has a search box but no filters. */
  onOpenFilters?: () => void;
}) {
  const theme = useTheme();
  const active = activeFilters > 0;
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      <View style={{ flex: 1 }}>
        <Input
          icon="search"
          value={search}
          onChangeText={onSearch}
          placeholder={placeholder}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={placeholder}
          {...(search
            ? {
                right: (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={8}
                    onPress={() => onSearch('')}
                    style={{ padding: theme.spacing.sm }}
                  >
                    <Icon name="close-circle" size={18} color={theme.colors.textFaint} />
                  </Pressable>
                ),
              }
            : {})}
        />
      </View>
      {onOpenFilters ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={active ? `Filters, ${activeFilters} on` : 'Filters'}
          onPress={onOpenFilters}
          style={({ pressed }) => ({
            alignItems: 'center',
            backgroundColor: active ? theme.colors.primarySoft : theme.colors.surfaceRaised,
            borderColor: active ? theme.colors.primary : theme.colors.borderStrong,
            borderRadius: theme.radius.sm + 2,
            borderWidth: 1,
            flexDirection: 'row',
            gap: 6,
            justifyContent: 'center',
            minHeight: TOUCH_TARGET + 4,
            opacity: pressed ? 0.8 : 1,
            paddingHorizontal: theme.spacing.md,
          })}
        >
          <Icon
            name="options-outline"
            size={20}
            color={active ? theme.colors.primary : theme.colors.textMuted}
          />
          {active ? (
            <AppText size="sm" weight="bold" tone="primary" tabular>
              {activeFilters}
            </AppText>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

export function FilterSheet({
  visible,
  onClose,
  onReset,
  children,
  title = 'Filters',
}: {
  visible: boolean;
  onClose: () => void;
  onReset: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button
            label="Reset"
            variant="secondary"
            icon="refresh"
            onPress={onReset}
            style={{ flex: 1 }}
          />
          <Button label="Show results" icon="checkmark" onPress={onClose} style={{ flex: 1 }} />
        </>
      }
    >
      {children}
    </Sheet>
  );
}
