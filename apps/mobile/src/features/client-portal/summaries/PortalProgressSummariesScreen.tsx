import { AI_SUMMARY_TYPE_LABELS, type AiSummaryType, type PortalAiSummary } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { usePagedResource } from '../../../shared/api/queries';
import { MetaLine } from '../../../shared/components/data-display';
import { SearchFilterBar } from '../../../shared/components/FilterSheet';
import { PressableCard } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { formatSince } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { dateRange } from '../portal-display';
import { portalKeys } from '../portal-keys';
import { PortalList } from '../PortalList';
import { StatusChips } from '../StatusChips';

/**
 * Published progress summaries, newest first.
 *
 * Every one was approved and published by a person; the portal type carries no internal text,
 * sources or review trail. The API has no search, so the search and the type filter narrow the
 * pages already loaded.
 */
export function PortalProgressSummariesScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<AiSummaryType | null>(null);
  const list = usePagedResource<PortalAiSummary>(portalKeys.summaries, '/portal/ai-summaries', {
    limit: 20,
  });
  const types = useMemo(() => [...new Set(list.items.map((item) => item.type))], [list.items]);

  const term = search.trim().toLowerCase();
  const visible = list.items.filter(
    (item) =>
      (!type || item.type === type) &&
      (!term ||
        item.title.toLowerCase().includes(term) ||
        item.content.toLowerCase().includes(term)),
  );

  return (
    <PortalList
      items={visible}
      isLoading={list.isLoading}
      error={list.error}
      isRefreshing={list.isRefreshing}
      onRefresh={list.refresh}
      {...(list.hasMore ? { onEndReached: list.loadMore } : {})}
      isLoadingMore={list.isLoadingMore}
      loadingLabel="Loading progress summaries"
      emptyTitle="No summaries yet"
      emptyDescription="Summaries appear here once your team has published one."
      emptyIcon="sparkles-outline"
      filtered={Boolean(term) || type !== null}
      header={
        <View style={{ gap: theme.spacing.sm }}>
          <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search summaries" />
          {types.length > 1 ? (
            <StatusChips
              options={types}
              value={type}
              onChange={setType}
              labelFor={(value) => AI_SUMMARY_TYPE_LABELS[value]}
            />
          ) : null}
        </View>
      }
      renderItem={(summary) => (
        <PressableCard
          accessibilityLabel={summary.title}
          accessibilityHint="Opens the summary"
          onPress={() => onOpen(summary.id)}
          icon="sparkles"
          iconTone="info"
        >
          <MetaLine icon="calendar-outline">
            {AI_SUMMARY_TYPE_LABELS[summary.type]} ·{' '}
            {dateRange(summary.periodStart, summary.periodEnd)}
          </MetaLine>
          <AppText weight="medium" numberOfLines={2}>
            {summary.title}
          </AppText>
          <AppText size="sm" tone="muted" numberOfLines={3}>
            {summary.content}
          </AppText>
          <MetaLine icon="time-outline">Published {formatSince(summary.publishedAt)}</MetaLine>
        </PressableCard>
      )}
    />
  );
}
