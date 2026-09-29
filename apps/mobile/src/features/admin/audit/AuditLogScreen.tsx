import { PERMISSIONS, type AuditLogEntrySummary } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';

import { usePagedResource } from '../../../shared/api/queries';
import { ListFooterLoader } from '../../../shared/components/feedback';
import { FilterSheet, SearchFilterBar, useDebounced } from '../../../shared/components/FilterSheet';
import { Screen } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { ListEmpty, NotAllowed } from '../shared/AdminStates';
import { AuditEntryCard } from './AuditEntryCard';
import { AuditEntrySheet } from './AuditEntrySheet';
import { AuditFilterFields } from './AuditFilterFields';
import {
  activeFilterCount,
  auditQuery,
  NO_AUDIT_FILTERS,
  type AuditFilters,
} from './audit-display';

/**
 * Audit history: who did what and when, newest first, with the web's filters — kind of record,
 * person, date range and a search over the action or record id.
 *
 * The history is internal: the API refuses it to a client's staff whatever their permissions, so
 * the screen asks the same two questions before it asks the API. It pages by cursor, so a long
 * history loads as it is scrolled rather than all at once.
 */
export function AuditLogScreen() {
  const theme = useTheme();
  const { user, can } = useSession();
  const allowed =
    can(PERMISSIONS.AUDIT_LOG_READ) && (user?.organization.isServiceProvider ?? false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<AuditFilters>(NO_AUDIT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [opened, setOpened] = useState<AuditLogEntrySummary | null>(null);
  const term = useDebounced(search.trim());
  const query = useMemo(() => auditQuery(filters, term), [filters, term]);
  const page = usePagedResource<AuditLogEntrySummary>(
    ['audit-logs', query],
    '/audit-logs',
    query,
    allowed,
  );

  if (!allowed) {
    return <NotAllowed message="The audit history is for the service provider’s administrators." />;
  }

  const count = activeFilterCount(filters);
  return (
    <Screen>
      <FlatList
        data={page.items}
        keyExtractor={(entry) => entry.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={page.isRefreshing} onRefresh={page.refresh} />}
        onEndReached={page.loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <SearchFilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search action or record id"
            activeFilters={count}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        }
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.sm }}
        ListFooterComponent={page.isLoadingMore ? <ListFooterLoader /> : null}
        ListEmptyComponent={
          <ListEmpty
            loading={page.isLoading}
            error={page.error}
            onRetry={page.refresh}
            filtered={Boolean(term) || count > 0}
            title="No audit entries yet"
            description="Sensitive changes appear here as people make them."
            icon="document-lock-outline"
            loadingLabel="Loading the audit history"
          />
        }
        renderItem={({ item }) => <AuditEntryCard entry={item} onPress={() => setOpened(item)} />}
      />
      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => setFilters(NO_AUDIT_FILTERS)}
      >
        <AuditFilterFields filters={filters} onChange={setFilters} />
      </FilterSheet>
      <AuditEntrySheet entry={opened} onClose={() => setOpened(null)} />
    </Screen>
  );
}
