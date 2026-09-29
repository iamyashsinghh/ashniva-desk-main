import {
  APPROVAL_LIST_VIEW,
  type ApprovalListView,
  type ApprovalStatus,
  type ApprovalSubjectType,
  type ApprovalSummary,
} from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { usePagedResource } from '../../shared/api/queries';
import { ListFooterLoader } from '../../shared/components/feedback';
import { FilterSheet, SearchFilterBar, useDebounced } from '../../shared/components/FilterSheet';
import type { IconName } from '../../shared/components/Icon';
import { Screen } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { TabBar } from '../../shared/components/TabBar';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { APPROVAL_VIEWS, STATUS_OPTIONS, SUBJECT_TYPE_OPTIONS } from './approval-display';
import { ApprovalRow } from './ApprovalRow';

/**
 * The provider's side of client approvals.
 *
 * `GET /approvals` is cursor-paged, so this pages: a manager with four months of decided requests
 * behind them should be able to scroll past the first twenty rather than be told that is all
 * there is. Search, subject type and status are the list endpoint's own parameters, so a filter
 * narrows on the server rather than hiding rows that were already fetched.
 *
 * The empty state names the view rather than the screen. "No approvals" under a filter that
 * happens to be empty reads as though the feature is broken.
 */
export function InternalApprovalsScreen({ onOpen }: { onOpen: (approvalId: string) => void }) {
  const theme = useTheme();
  const [view, setView] = useState<ApprovalListView>(APPROVAL_LIST_VIEW.INBOX);
  const [search, setSearch] = useState('');
  const [subjectType, setSubjectType] = useState<ApprovalSubjectType[]>([]);
  const [statuses, setStatuses] = useState<ApprovalStatus[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const term = useDebounced(search.trim());

  const query = {
    view,
    limit: 20,
    ...(term ? { search: term } : {}),
    ...(subjectType[0] ? { subjectType: subjectType[0] } : {}),
    ...(statuses.length > 0 ? { status: statuses.join(',') } : {}),
  };
  const list = usePagedResource<ApprovalSummary>(['approvals', 'list', query], '/approvals', query);
  const activeFilters = (subjectType.length > 0 ? 1 : 0) + (statuses.length > 0 ? 1 : 0);
  const filtered = activeFilters > 0 || term.length > 0;

  const header = (
    <View>
      <TabBar
        options={APPROVAL_VIEWS}
        value={view}
        onChange={setView}
        accessibilityLabel="Which approval requests to show"
      />
      <View style={{ padding: theme.spacing.screen, paddingBottom: theme.spacing.xs }}>
        <SearchFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search approval requests"
          activeFilters={activeFilters}
          onOpenFilters={() => setFiltersOpen(true)}
        />
      </View>
      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setSubjectType([]);
          setStatuses([]);
        }}
      >
        <SelectField
          label="What it is about"
          icon="pricetag-outline"
          options={SUBJECT_TYPE_OPTIONS}
          value={subjectType}
          onChange={setSubjectType}
          allowClear
          clearLabel="Anything"
          placeholder="Anything"
        />
        <SelectField
          label="Status"
          icon="flag-outline"
          options={STATUS_OPTIONS}
          value={statuses}
          onChange={setStatuses}
          multiple
          placeholder="Any status"
        />
      </FilterSheet>
    </View>
  );

  if (list.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading approval requests" />
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

  const empty = filtered ? FILTERED_EMPTY : EMPTY[view];

  return (
    <Screen>
      {header}
      <FlatList
        data={list.items}
        keyExtractor={(approval) => approval.id}
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingTop: theme.spacing.sm,
        }}
        keyboardShouldPersistTaps="handled"
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
          <EmptyState title={empty.title} description={empty.body} icon={empty.icon} />
        }
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
        renderItem={({ item }) => <ApprovalRow item={item} onOpen={() => onOpen(item.id)} />}
      />
    </Screen>
  );
}

interface EmptyCopy {
  title: string;
  body: string;
  icon: IconName;
}

const FILTERED_EMPTY: EmptyCopy = {
  title: 'Nothing matches',
  body: 'No request in this view matches the search or filters.',
  icon: 'search-outline',
};

const EMPTY: Record<ApprovalListView, EmptyCopy> = {
  [APPROVAL_LIST_VIEW.INBOX]: {
    title: 'Nothing waiting on you',
    body: 'Requests you have to prepare or publish appear here.',
    icon: 'shield-checkmark-outline',
  },
  [APPROVAL_LIST_VIEW.WAITING_CLIENT]: {
    title: 'Nothing with the client',
    body: 'Published requests appear here until the client answers.',
    icon: 'hourglass-outline',
  },
  [APPROVAL_LIST_VIEW.DECIDED]: {
    title: 'Nothing decided yet',
    body: 'Approved, rejected and returned requests appear here.',
    icon: 'checkmark-done-outline',
  },
  [APPROVAL_LIST_VIEW.MINE]: {
    title: 'Nothing requested by you',
    body: 'Requests you prepare appear here, whatever state they are in.',
    icon: 'create-outline',
  },
  [APPROVAL_LIST_VIEW.ALL]: {
    title: 'No approval requests yet',
    body: 'Approval requests are prepared from milestones, documents, updates and change requests.',
    icon: 'shield-checkmark-outline',
  },
};
