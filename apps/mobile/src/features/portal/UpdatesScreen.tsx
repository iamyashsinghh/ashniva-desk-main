import type { PortalAiSummary, PortalReleaseNoteSummary } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { usePagedResource, type PagedResult } from '../../shared/api/queries';
import { ListFooterLoader } from '../../shared/components/feedback';
import { PressableCard } from '../../shared/components/layout';
import { Segmented, type SegmentOption } from '../../shared/components/navigation-list';
import { AppText, Button, Card, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { animateLayout } from '../../shared/theme/motion';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * What a client's team has published: progress summaries and releases.
 *
 * Both lists come from portal endpoints, which return only published records scoped to the
 * caller's own organization. There is no filtering here — nothing arrives that should be hidden.
 *
 * One list at a time rather than both stacked, and that is the change worth naming. Both
 * endpoints are cursor-paged, and a screen that reads one page of each and stacks them can only
 * ever show the first ten of each: scrolling to the bottom of the summaries reaches the top of
 * the releases, not the eleventh summary. A segmented control gives each list the whole screen,
 * which is what "load the next page when you reach the end" needs to mean anything.
 */

type Section = 'progress' | 'releases';

const SECTIONS: readonly SegmentOption<Section>[] = [
  { value: 'progress', label: 'Progress' },
  { value: 'releases', label: 'Releases' },
];

export function UpdatesScreen({ onOpenRelease }: { onOpenRelease: (releaseId: string) => void }) {
  const theme = useTheme();
  const [section, setSection] = useState<Section>('progress');

  // Both are declared on every render rather than only the selected one: hooks cannot be
  // conditional, and React Query does not fetch a list nobody is subscribed to twice anyway.
  const summaries = usePagedResource<PortalAiSummary>(
    ['portal', 'ai-summaries'],
    '/portal/ai-summaries',
    { limit: 20 },
  );
  const releases = usePagedResource<PortalReleaseNoteSummary>(
    ['portal', 'release-notes'],
    '/portal/release-notes',
    { limit: 20 },
  );

  const header = (
    <View style={{ padding: theme.spacing.screen, paddingBottom: theme.spacing.xs }}>
      <Segmented options={SECTIONS} value={section} onChange={setSection} label="What to show" />
    </View>
  );

  return (
    <Screen>
      {header}
      {section === 'progress' ? (
        <UpdatesList
          list={summaries}
          loadingLabel="Loading progress summaries"
          emptyTitle="Nothing published yet"
          emptyBody="Progress summaries appear here once your team publishes them."
          renderItem={(summary) => <SummaryCard summary={summary} />}
        />
      ) : (
        <UpdatesList
          list={releases}
          loadingLabel="Loading releases"
          emptyTitle="Nothing released yet"
          emptyBody="Releases your team publishes appear here, with what changed in each."
          renderItem={(release) => (
            <PressableCard
              accessibilityLabel={`Version ${release.version}`}
              accessibilityHint="Opens what changed in this release"
              onPress={() => onOpenRelease(release.id)}
            >
              <AppText size="xs" tone="faint" numberOfLines={1}>
                Released {formatDate(release.releaseDate)}
              </AppText>
              <AppText weight="medium">Version {release.version}</AppText>
              <AppText size="sm" tone="primary">
                See what changed
              </AppText>
            </PressableCard>
          )}
        />
      )}
    </Screen>
  );
}

/** Past this many characters a summary folds, so one long week does not bury the rest. */
const FOLD_AFTER = 320;

/**
 * One progress summary: its period as an overline, then the title and what the team wrote.
 *
 * The fold is only over text already on the device — "Show more" reveals, it does not fetch.
 */
function SummaryCard({ summary }: { summary: PortalAiSummary }) {
  const theme = useTheme();
  const long = summary.content.length > FOLD_AFTER;
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ gap: theme.spacing.xs + 2 }}>
      <AppText size="xs" tone="faint" numberOfLines={1}>
        {formatDate(summary.periodStart)} – {formatDate(summary.periodEnd)}
      </AppText>
      <AppText weight="medium">{summary.title}</AppText>
      <AppText size="sm" numberOfLines={long && !open ? 6 : undefined}>
        {summary.content}
      </AppText>
      {long ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label={open ? 'Show less' : 'Show more'}
            variant="ghost"
            size="sm"
            onPress={() => {
              animateLayout();
              setOpen((value) => !value);
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * The list half, once per section.
 *
 * Generic over the row because the two lists differ only in what a row looks like — everything
 * else, including the three loading states and the "an error does not clear what is on screen"
 * rule, is the same and should not be written twice.
 */
function UpdatesList<T extends { id: string }>({
  list,
  loadingLabel,
  emptyTitle,
  emptyBody,
  renderItem,
}: {
  list: PagedResult<T>;
  loadingLabel: string;
  emptyTitle: string;
  emptyBody: string;
  renderItem: (item: T) => React.JSX.Element;
}) {
  const theme = useTheme();

  if (list.isLoading) {
    return <LoadingState label={loadingLabel} />;
  }

  if (list.error) {
    return (
      <ErrorState
        message={errorMessage(list.error)}
        offline={list.error instanceof Error && list.error.name === 'NetworkError'}
        onRetry={list.refresh}
      />
    );
  }

  return (
    <FlatList
      data={list.items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{
        gap: theme.spacing.sm,
        padding: theme.spacing.screen,
        paddingTop: theme.spacing.sm,
      }}
      refreshControl={
        <RefreshControl
          refreshing={list.isRefreshing}
          onRefresh={list.refresh}
          tintColor={theme.colors.primary}
        />
      }
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={<EmptyState title={emptyTitle} description={emptyBody} />}
      ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
      renderItem={({ item }) => renderItem(item)}
    />
  );
}
