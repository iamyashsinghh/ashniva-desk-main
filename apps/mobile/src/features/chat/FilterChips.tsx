import { ScrollView, Pressable, StyleSheet } from 'react-native';

import { AppText } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  CONVERSATION_FILTERS,
  CONVERSATION_FILTER_LABELS,
  type ConversationFilter,
} from './conversation-filters';

/**
 * The filters, as a scrollable row of chips.
 *
 * A row rather than the web app's sidebar, and scrollable rather than a segmented control: there
 * are seven of them and a segmented control that holds seven on a phone holds none of them
 * legibly, least of all at a large text size. Horizontal scrolling keeps every label whole and
 * every target at 44 points.
 *
 * `accessibilityState.selected` rather than colour alone, so which one is on is not carried by a
 * colour difference.
 */
export function FilterChips({
  value,
  onChange,
}: {
  value: ConversationFilter;
  onChange: (filter: ConversationFilter) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}
    >
      {CONVERSATION_FILTERS.map((filter) => {
        const selected = filter === value;
        return (
          <Pressable
            key={filter}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${CONVERSATION_FILTER_LABELS[filter]} conversations`}
            onPress={() => onChange(filter)}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              borderWidth: StyleSheet.hairlineWidth,
              justifyContent: 'center',
              minHeight: TOUCH_TARGET,
              opacity: pressed ? 0.8 : 1,
              paddingHorizontal: theme.spacing.lg,
            })}
          >
            <AppText size="sm" weight="medium" tone={selected ? 'inverse' : 'default'}>
              {CONVERSATION_FILTER_LABELS[filter]}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
