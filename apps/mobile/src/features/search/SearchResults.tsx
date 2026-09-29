import type { SearchGroup, SearchHit } from '@ashniva/types';
import { Fragment } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconTile } from '../../shared/components/Icon';
import { AppText, Button, Card, Divider } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { iconForType } from './search-targets';
import { SearchHitRow } from './SearchHitRow';

/**
 * The groups, in the order the API returns them — which is the same order every time, so a
 * person learns where tickets sit in the list.
 *
 * "Show more" asks for the full result set: the per-module cap the web's results page uses. The
 * quick answer stays small because it is re-asked on every pause in typing.
 */
export function SearchResults({
  groups,
  truncated,
  expanded,
  onShowMore,
  targetOf,
}: {
  groups: readonly SearchGroup[];
  truncated: boolean;
  /** Already showing the full set; nothing more to ask for. */
  expanded: boolean;
  onShowMore: () => void;
  /** How a hit opens, or null when the phone has nowhere to open it. */
  targetOf: (hit: SearchHit) => (() => void) | null;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{
        gap: theme.spacing.section,
        padding: theme.spacing.screen,
        paddingBottom: insets.bottom + theme.spacing.xl,
      }}
    >
      {groups.map((group) => {
        const { icon, tone } = iconForType(group.type);
        const count = `${group.hits.length}${group.hasMore ? '+' : ''}`;
        return (
          <View key={group.type} style={{ gap: theme.spacing.sm }}>
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={`${group.label}, ${count} ${group.hits.length === 1 ? 'match' : 'matches'}`}
              style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}
            >
              <IconTile name={icon} tone={tone} size={28} />
              <AppText variant="heading" style={{ flex: 1 }}>
                {group.label}
              </AppText>
              <View
                style={{
                  backgroundColor: theme.colors.surfaceSunken,
                  borderRadius: theme.radius.pill,
                  minWidth: 28,
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: 2,
                }}
              >
                <AppText size="xs" weight="bold" tone="muted" tabular align="center">
                  {count}
                </AppText>
              </View>
            </View>
            <Card padded={false} style={{ gap: 0, overflow: 'hidden' }}>
              {group.hits.map((hit, index) => {
                const open = targetOf(hit);
                return (
                  <Fragment key={`${hit.type}-${hit.id}`}>
                    {index > 0 ? <Divider inset={theme.spacing.lg} /> : null}
                    <SearchHitRow hit={hit} {...(open ? { onPress: open } : {})} />
                  </Fragment>
                );
              })}
            </Card>
            {group.hasMore && !expanded ? (
              <Button
                label={`Show more ${group.label.toLowerCase()}`}
                variant="ghost"
                size="sm"
                icon="chevron-down"
                onPress={onShowMore}
              />
            ) : null}
          </View>
        );
      })}
      {truncated || (expanded && groups.some((group) => group.hasMore)) ? (
        <AppText size="sm" tone="muted" align="center">
          Showing the closest matches. Add a word or a reference to narrow the search.
        </AppText>
      ) : null}
    </ScrollView>
  );
}
