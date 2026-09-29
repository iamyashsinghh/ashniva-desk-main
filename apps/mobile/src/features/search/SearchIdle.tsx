import { SEARCH_MIN_QUERY_LENGTH } from '@ashniva/types';
import { Pressable, ScrollView, View } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { SectionHeader } from '../../shared/components/layout';
import { AppText, Card, Divider } from '../../shared/components/primitives';
import { EmptyState } from '../../shared/components/states';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * What the screen shows before there is a term worth running: a nudge to keep typing, the last
 * few searches, and a line on what search covers.
 *
 * Nothing is fetched here. A term under the API's minimum would be refused, and an empty box must
 * not read as "here is everything".
 */
export function SearchIdle({
  term,
  client,
  recent,
  onPickRecent,
  onClearRecent,
}: {
  term: string;
  client: boolean;
  recent: readonly string[];
  onPickRecent: (term: string) => void;
  onClearRecent: () => void;
}) {
  const theme = useTheme();
  const typing = term.trim().length > 0;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ gap: theme.spacing.section, padding: theme.spacing.screen }}
    >
      {typing ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.infoSoft,
            borderRadius: theme.radius.md,
            flexDirection: 'row',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
          }}
        >
          <Icon name="information-circle-outline" size={18} color={theme.colors.info} />
          <AppText size="sm" style={{ color: theme.colors.info, flex: 1 }}>
            Keep typing — at least {SEARCH_MIN_QUERY_LENGTH} characters.
          </AppText>
        </View>
      ) : null}

      {recent.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader
            title="Recent searches"
            icon="time-outline"
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear recent searches"
                hitSlop={10}
                onPress={onClearRecent}
              >
                <AppText size="sm" weight="medium" tone="primary">
                  Clear
                </AppText>
              </Pressable>
            }
          />
          <Card padded={false} style={{ gap: 0, overflow: 'hidden' }}>
            {recent.map((entry, index) => (
              <View key={entry}>
                {index > 0 ? <Divider inset={theme.spacing.lg + 28} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Search again for ${entry}`}
                  onPress={() => onPickRecent(entry)}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
                    flexDirection: 'row',
                    gap: theme.spacing.md,
                    minHeight: TOUCH_TARGET + 4,
                    paddingHorizontal: theme.spacing.lg,
                  })}
                >
                  <Icon name="search-outline" size={16} color={theme.colors.textFaint} />
                  <AppText numberOfLines={1} style={{ flex: 1 }}>
                    {entry}
                  </AppText>
                  <Icon
                    name="arrow-up-outline"
                    size={16}
                    color={theme.colors.textFaint}
                    style={{ transform: [{ rotate: '-45deg' }] }}
                  />
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {!typing && recent.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="Search everything you can see"
          description={
            client
              ? 'Find your tickets and change requests by reference or title.'
              : 'Tasks, tickets, projects, contracts and more — by reference, title or client. Only what you can already open is searched.'
          }
        />
      ) : null}
    </ScrollView>
  );
}
