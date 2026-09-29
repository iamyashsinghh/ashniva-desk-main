import { PERMISSIONS, type ReleaseSummary } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { usePagedResource } from '../../shared/api/queries';
import { ListFooterLoader } from '../../shared/components/feedback';
import { FilterSheet, SearchFilterBar, useDebounced } from '../../shared/components/FilterSheet';
import { ProjectPicker } from '../../shared/components/pickers';
import { Button, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { TabBar } from '../../shared/components/TabBar';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { CreateReleaseSheet } from './CreateReleaseSheet';
import { RELEASE_VIEW_TABS, RELEASE_VIEWS, type ReleaseView } from './release-display';
import { ReleaseRow } from './ReleaseRow';

/**
 * Releases on the provider's side, grouped by where they are rather than by date.
 *
 * Search, project and view are all `GET /releases` parameters, so a filter narrows on the server
 * and a long history pages in rather than being downloaded to be filtered on the phone.
 */
export function ReleasesScreen({ onOpen }: { onOpen: (releaseId: string) => void }) {
  const theme = useTheme();
  const { can } = useSession();
  const [view, setView] = useState<ReleaseView>('in-flight');
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const term = useDebounced(search.trim());
  const statuses = RELEASE_VIEWS[view].statuses;

  const query = {
    limit: 20,
    ...(statuses ? { status: statuses.join(',') } : {}),
    ...(term ? { search: term } : {}),
    ...(projectId ? { projectId } : {}),
  };
  const list = usePagedResource<ReleaseSummary>(['releases', 'list', query], '/releases', query);
  const filtered = Boolean(term) || Boolean(projectId);
  const canCreate = can(PERMISSIONS.RELEASE_MANAGE);

  const header = (
    <View>
      <TabBar
        options={RELEASE_VIEW_TABS}
        value={view}
        onChange={setView}
        accessibilityLabel="Which releases to show"
      />
      <View style={{ gap: theme.spacing.md, padding: theme.spacing.screen, paddingBottom: 0 }}>
        <SearchFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search version or title"
          activeFilters={projectId ? 1 : 0}
          onOpenFilters={() => setFiltersOpen(true)}
        />
        {canCreate ? (
          <Button
            label="New release"
            icon="add"
            variant="secondary"
            onPress={() => setCreating(true)}
          />
        ) : null}
      </View>
      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => setProjectId(null)}
      >
        <ProjectPicker
          value={projectId}
          onChange={setProjectId}
          allowClear
          placeholder="Every project"
        />
      </FilterSheet>
      {creating ? (
        <CreateReleaseSheet
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpen(id);
          }}
        />
      ) : null}
    </View>
  );

  if (list.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading releases" />
      </Screen>
    );
  }

  if (list.error) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={errorMessage(list.error)}
          offline={list.error instanceof Error && list.error.name === 'NetworkError'}
          onRetry={list.refresh}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <FlatList
        data={list.items}
        keyExtractor={(release) => release.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh
            busy={list.isRefreshing}
            onRefresh={list.refresh}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          filtered ? (
            <EmptyState
              title="Nothing matches"
              description="No release in this view matches the search or project."
              icon="search-outline"
            />
          ) : (
            <EmptyState
              title="No releases here"
              description="A release collects the tasks and tickets going out together, and records who approved it."
              icon="rocket-outline"
              iconTone="violet"
            />
          )
        }
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
        renderItem={({ item }) => <ReleaseRow release={item} onOpen={() => onOpen(item.id)} />}
      />
    </Screen>
  );
}
