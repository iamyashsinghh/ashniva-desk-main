import {
  CONTRACT_LIST_VIEW,
  PERMISSIONS,
  type ContractListView,
  type ContractSummary,
  type ContractType,
} from '@ashniva/types';
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
import { useClientOptions } from './commercial-options';
import { CONTRACT_TYPE_OPTIONS, CONTRACT_VIEWS } from './contract-display';
import { ContractRow } from './ContractRow';

/**
 * The provider's contracts: the web list's views, type and client filters, and search.
 *
 * `GET /contracts` is cursor-paged and filters on the server, so a filter narrows the query rather
 * than hiding rows already fetched, and scrolling keeps going past the first page.
 */
export function ContractsScreen({
  onOpen,
  onCreate,
}: {
  onOpen: (contractId: string) => void;
  onCreate: () => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const [view, setView] = useState<ContractListView>(CONTRACT_LIST_VIEW.ACTIVE);
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState<ContractType[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const term = useDebounced(search.trim());
  const clientOptions = useClientOptions(filtersOpen || clients.length > 0);

  const query = {
    view,
    limit: 25,
    ...(term ? { search: term } : {}),
    ...(types[0] ? { type: types[0] } : {}),
    ...(clients[0] ? { clientOrganizationId: clients[0] } : {}),
  };
  const list = usePagedResource<ContractSummary>(['contracts', 'list', query], '/contracts', query);
  const activeFilters = (types.length > 0 ? 1 : 0) + (clients.length > 0 ? 1 : 0);
  const filtered = activeFilters > 0 || term.length > 0;

  const header = (
    <View>
      <TabBar
        options={CONTRACT_VIEWS}
        value={view}
        onChange={setView}
        accessibilityLabel="Which contracts to show"
      />
      <View style={{ gap: theme.spacing.sm, padding: theme.spacing.screen, paddingBottom: 0 }}>
        <SearchFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search number or title"
          activeFilters={activeFilters}
          onOpenFilters={() => setFiltersOpen(true)}
        />
        {can(PERMISSIONS.CONTRACT_MANAGE) ? (
          <Button label="New contract" icon="add" onPress={onCreate} />
        ) : null}
      </View>
      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setTypes([]);
          setClients([]);
        }}
      >
        <SelectField
          label="Type"
          icon="pricetag-outline"
          options={CONTRACT_TYPE_OPTIONS}
          value={types}
          onChange={setTypes}
          allowClear
          clearLabel="All types"
          placeholder="All types"
        />
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
      </FilterSheet>
    </View>
  );

  if (list.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading contracts" />
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
        keyExtractor={(contract) => contract.id}
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
              title="No contracts match"
              description="Nothing in this view matches the search or filters."
              icon="search-outline"
            />
          ) : (
            <EmptyState
              title="No contracts here"
              description="Contracts in this view appear here with their dates and remaining hours."
              icon="document-text-outline"
            />
          )
        }
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
        renderItem={({ item }) => <ContractRow contract={item} onOpen={() => onOpen(item.id)} />}
      />
    </Screen>
  );
}
