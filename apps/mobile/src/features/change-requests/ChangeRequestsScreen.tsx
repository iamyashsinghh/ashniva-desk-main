import { PERMISSIONS, type ChangeRequestSummary } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { usePagedResource } from '../../shared/api/queries';
import { ListFooterLoader } from '../../shared/components/feedback';
import { FilterSheet, SearchFilterBar, useDebounced } from '../../shared/components/FilterSheet';
import { Button, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { SelectField } from '../../shared/components/SelectField';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { TabBar } from '../../shared/components/TabBar';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { ToggleRow } from '../tasks/ToggleRow';
import { useClientOptions } from '../contracts/commercial-options';
import {
  CHANGE_REQUEST_VIEW_STATUSES,
  CHANGE_REQUEST_VIEWS,
  type ChangeRequestView,
} from './change-request-display';
import { ChangeRequestRow } from './ChangeRequestRow';

/**
 * Change requests on the provider side: the web list's "who is it waiting on" views and search,
 * plus the client and "raised by me" filters the API offers.
 */
export function ChangeRequestsScreen({
  onOpen,
  onCreate,
}: {
  onOpen: (changeRequestId: string) => void;
  onCreate: () => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const [view, setView] = useState<ChangeRequestView>('open');
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState<string[]>([]);
  const [mine, setMine] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const term = useDebounced(search.trim());
  const clientOptions = useClientOptions(filtersOpen || clients.length > 0);
  const statuses = CHANGE_REQUEST_VIEW_STATUSES[view];

  const query = {
    limit: 25,
    ...(statuses ? { status: statuses.join(',') } : {}),
    ...(term ? { search: term } : {}),
    ...(clients[0] ? { clientOrganizationId: clients[0] } : {}),
    ...(mine ? { mine: true } : {}),
  };
  const list = usePagedResource<ChangeRequestSummary>(
    ['change-requests', 'list', query],
    '/change-requests',
    query,
  );
  const activeFilters = (clients.length > 0 ? 1 : 0) + (mine ? 1 : 0);
  const filtered = activeFilters > 0 || term.length > 0;

  const header = (
    <View>
      <TabBar
        options={CHANGE_REQUEST_VIEWS}
        value={view}
        onChange={setView}
        accessibilityLabel="Which change requests to show"
      />
      <View style={{ gap: theme.spacing.sm, padding: theme.spacing.screen, paddingBottom: 0 }}>
        <SearchFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search by number or title"
          activeFilters={activeFilters}
          onOpenFilters={() => setFiltersOpen(true)}
        />
        {can(PERMISSIONS.CHANGE_REQUEST_RAISE) ? (
          <Button label="Raise a change request" icon="add" onPress={onCreate} />
        ) : null}
      </View>
      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setClients([]);
          setMine(false);
        }}
      >
        <SelectField
          label="Client"
          icon="business-outline"
          options={clientOptions.options}
          value={clients}
          onChange={setClients}
          loading={clientOptions.isLoading}
          allowClear
          clearLabel="All clients"
          placeholder="All clients"
        />
        <ToggleRow
          label="Raised by me"
          description="Only the requests you raised."
          icon="person-outline"
          value={mine}
          onChange={setMine}
        />
      </FilterSheet>
    </View>
  );

  if (list.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading change requests" />
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
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.screen }}
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
          filtered ? (
            <EmptyState
              title="No change requests match"
              description="Nothing in this view matches the search or filters."
              icon="search-outline"
            />
          ) : (
            <EmptyState
              title="No change requests"
              description="Scope changes raised by clients or staff appear here with their approval status."
              icon="git-pull-request-outline"
            />
          )
        }
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
        renderItem={({ item }) => <ChangeRequestRow item={item} onOpen={() => onOpen(item.id)} />}
      />
    </Screen>
  );
}
