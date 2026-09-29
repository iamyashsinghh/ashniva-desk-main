import { View } from 'react-native';

import { Button, Input } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { inboxFiltersFor, type ConversationFilter } from './conversation-filters';
import { FilterChips } from './FilterChips';

/**
 * The top of the inbox: search, start a conversation, the administrator switch and the chips.
 *
 * Above the list rather than its header component, so it stays put while the rows scroll and a
 * pull-to-refresh can never leave the search bar stranded half-way down the screen.
 */
export function InboxHeader({
  search,
  onSearch,
  filter,
  onFilter,
  personalChat,
  unreadCount,
  onStart,
  oversight,
  onToggleOversight,
}: {
  search: string;
  onSearch: (value: string) => void;
  filter: ConversationFilter;
  onFilter: (filter: ConversationFilter) => void;
  personalChat: boolean;
  unreadCount: number | null;
  onStart?: (() => void) | undefined;
  oversight: boolean;
  /** Present only for somebody holding `conversation:inspect`. */
  onToggleOversight?: (() => void) | undefined;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        gap: theme.spacing.sm,
        paddingBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.screen,
        paddingTop: theme.spacing.sm,
      }}
    >
      {oversight ? null : (
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Input
              accessibilityLabel="Search your conversations"
              placeholder={personalChat ? 'Search people' : 'Search conversations'}
              icon="search-outline"
              value={search}
              onChangeText={onSearch}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          {onStart ? (
            <Button
              label="New conversation"
              accessibilityHint="Start a direct message or a group"
              onPress={onStart}
              size="sm"
              icon="create-outline"
            />
          ) : null}
        </View>
      )}
      {onToggleOversight ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label={oversight ? 'Viewing as administrator' : 'Administrator view'}
            accessibilityHint={
              oversight
                ? 'Back to your own conversations'
                : 'Shows conversations and calls you are not part of. Every view is audited.'
            }
            variant={oversight ? 'primary' : 'ghost'}
            size="sm"
            icon="shield-checkmark-outline"
            onPress={onToggleOversight}
          />
        </View>
      ) : null}
      {oversight ? null : (
        <FilterChips
          value={filter}
          onChange={onFilter}
          filters={inboxFiltersFor(personalChat)}
          unreadCount={unreadCount}
        />
      )}
    </View>
  );
}
