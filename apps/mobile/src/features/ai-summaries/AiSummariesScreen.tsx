import { PERMISSIONS } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { Chip, ChipScroller } from '../../shared/components/chips';
import { Banner, ListFooterLoader } from '../../shared/components/feedback';
import { SearchFilterBar, useDebounced } from '../../shared/components/FilterSheet';
import { Grow } from '../../shared/components/layout';
import { Button, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { useAiProviderStatus, useAiSummaries } from './api';
import { GenerateSummarySheet } from './GenerateSummarySheet';
import { SummaryCard } from './SummaryCard';
import { SUMMARY_VIEWS, type SummaryView } from './summary-display';

const VIEW_KEYS = Object.keys(SUMMARY_VIEWS) as SummaryView[];

/**
 * Progress summaries: generated drafts, grouped by where each has reached in review.
 *
 * Everything generated is a draft until a person approves it; the views follow that — what is
 * still being written, what is waiting on a reviewer, what has gone to the client. "New summary"
 * needs ai-summary:generate and a configured provider, and says so when there is none.
 */
export function AiSummariesScreen({
  onOpen,
  onOpenUsage,
}: {
  onOpen: (id: string) => void;
  onOpenUsage: () => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const canRead = can(PERMISSIONS.AI_SUMMARY_READ);
  const canGenerate = can(PERMISSIONS.AI_SUMMARY_GENERATE);
  const [view, setView] = useState<SummaryView>('open');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const term = useDebounced(search.trim());
  const list = useAiSummaries(SUMMARY_VIEWS[view].statuses, term, canRead);
  const provider = useAiProviderStatus(canRead);
  const unconfigured = provider.data ? !provider.data.configured : false;

  if (!canRead) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          description="Progress summaries need the ai-summary:read permission."
        />
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      {unconfigured ? (
        <Banner tone="warning" title="No AI provider is configured">
          Nothing can be generated yet. An administrator connects a provider for the organization
          through the integrations API.
        </Banner>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {canGenerate ? (
          <Grow>
            <Button
              label="New summary"
              icon="sparkles-outline"
              disabled={unconfigured}
              onPress={() => setCreating(true)}
            />
          </Grow>
        ) : null}
        <Grow>
          <Button
            label="Usage"
            icon="analytics-outline"
            variant="secondary"
            onPress={onOpenUsage}
          />
        </Grow>
      </View>
      <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search summaries" />
      <ChipScroller>
        {VIEW_KEYS.map((key) => (
          <Chip
            key={key}
            role="tab"
            label={SUMMARY_VIEWS[key].label}
            selected={key === view}
            onPress={() => setView(key)}
          />
        ))}
      </ChipScroller>
    </View>
  );

  let empty = (
    <EmptyState
      icon="sparkles-outline"
      title={term ? 'No matching summaries' : 'No summaries'}
      description={
        term
          ? `Nothing in this view matches “${term}”.`
          : 'Generate a summary of a period from tasks, tickets and updates. Everything generated is a draft until someone approves it.'
      }
    />
  );
  if (list.isLoading) {
    empty = <LoadingState label="Loading summaries" />;
  } else if (list.error) {
    empty = (
      <ErrorState
        message={errorMessage(list.error)}
        offline={list.error instanceof Error && list.error.name === 'NetworkError'}
        onRetry={list.refresh}
      />
    );
  }

  return (
    <Screen>
      <FlatList
        data={list.items}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={list.isRefreshing} onRefresh={list.refresh} />}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.sm }}
        ListEmptyComponent={empty}
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : null}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => <SummaryCard row={item} onPress={() => onOpen(item.id)} />}
      />
      {canGenerate ? (
        <GenerateSummarySheet
          visible={creating}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpen(id);
          }}
        />
      ) : null}
    </Screen>
  );
}
