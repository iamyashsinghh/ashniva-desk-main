import { PERMISSIONS, type ReleaseNoteSummary } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { usePagedResource } from '../../shared/api/queries';
import { ListFooterLoader } from '../../shared/components/feedback';
import { FilterSheet, SearchFilterBar } from '../../shared/components/FilterSheet';
import { ProjectPicker } from '../../shared/components/pickers';
import { Button, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { TabBar } from '../../shared/components/TabBar';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import {
  RELEASE_NOTE_VIEW_TABS,
  RELEASE_NOTE_VIEWS,
  type ReleaseNoteView,
} from './release-note-display';
import { ReleaseNoteFormSheet } from './ReleaseNoteFormSheet';
import { ReleaseNoteRow } from './ReleaseNoteRow';

/**
 * Internal release notes, grouped by where each has reached in review.
 *
 * View and project are `GET /release-notes` parameters. The endpoint has no text search, so the
 * search box narrows the pages already loaded by project code and version — enough for a list that
 * is a handful of notes per project, and said so in the empty state rather than implied.
 */
export function ReleaseNotesScreen({ onOpen }: { onOpen: (noteId: string) => void }) {
  const theme = useTheme();
  const { can } = useSession();
  const [view, setView] = useState<ReleaseNoteView>('open');
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const statuses = RELEASE_NOTE_VIEWS[view].statuses;

  const query = {
    limit: 50,
    ...(statuses ? { status: statuses.join(',') } : {}),
    ...(projectId ? { projectId } : {}),
  };
  const list = usePagedResource<ReleaseNoteSummary>(
    ['release-notes', 'list', query],
    '/release-notes',
    query,
  );
  const term = search.trim().toLowerCase();
  const shown = term
    ? list.items.filter((note) =>
        `${note.projectCode} ${note.version}`.toLowerCase().includes(term),
      )
    : list.items;
  const filtered = Boolean(term) || Boolean(projectId);
  const canCreate = can(PERMISSIONS.RELEASE_NOTE_WRITE);

  const header = (
    <View>
      <TabBar
        options={RELEASE_NOTE_VIEW_TABS}
        value={view}
        onChange={setView}
        accessibilityLabel="Which release notes to show"
      />
      <View style={{ gap: theme.spacing.md, padding: theme.spacing.screen, paddingBottom: 0 }}>
        <SearchFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search project code or version"
          activeFilters={projectId ? 1 : 0}
          onOpenFilters={() => setFiltersOpen(true)}
        />
        {canCreate ? (
          <Button
            label="New release note"
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
        <ReleaseNoteFormSheet onClose={() => setCreating(false)} onSaved={onOpen} />
      ) : null}
    </View>
  );

  if (list.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading release notes" />
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
        data={shown}
        keyExtractor={(note) => note.id}
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
              description={
                list.hasMore
                  ? 'Nothing loaded so far matches. Scroll to load more, or clear the search.'
                  : 'No release note in this view matches the search or project.'
              }
              icon="search-outline"
            />
          ) : (
            <EmptyState
              title="No release notes here"
              description="Draft a release note to summarise what a client received in a release."
              icon="document-text-outline"
              iconTone="teal"
            />
          )
        }
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
        renderItem={({ item }) => <ReleaseNoteRow note={item} onOpen={() => onOpen(item.id)} />}
      />
    </Screen>
  );
}
