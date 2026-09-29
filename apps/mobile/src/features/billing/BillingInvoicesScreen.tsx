import { PERMISSIONS, type InvoiceSummary } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { Chip, ChipScroller } from '../../shared/components/chips';
import { SearchFilterBar, useDebounced } from '../../shared/components/FilterSheet';
import { ListFooterLoader } from '../../shared/components/feedback';
import { AppText, Button, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { billingKeys, usePagedWithTotal } from './billing-api';
import { INVOICE_VIEWS, type InvoiceView } from './billing-display';
import { InvoiceCard } from './InvoiceCard';

/**
 * The provider's invoices, grouped by what needs attention — the web list's views, its search
 * (invoice number or client, on the server) and its count.
 *
 * "New invoice" needs `invoice:write`, the permission `POST /invoices` checks.
 */
export function BillingInvoicesScreen({
  onOpen,
  onCreate,
}: {
  onOpen: (invoiceId: string) => void;
  onCreate: () => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const [view, setView] = useState<InvoiceView>('open');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const statuses = INVOICE_VIEWS.find((option) => option.value === view)?.statuses;

  const list = usePagedWithTotal<InvoiceSummary>(
    billingKeys.invoices({ view, search: term }),
    '/invoices',
    { status: statuses?.join(','), search: term || undefined, limit: 25 },
  );

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      <SearchFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Invoice number or client"
      />
      <ChipScroller>
        {INVOICE_VIEWS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            role="radio"
            selected={option.value === view}
            onPress={() => setView(option.value)}
          />
        ))}
      </ChipScroller>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
        <AppText size="sm" tone="muted" style={{ flex: 1 }}>
          {list.total === null ? ' ' : `${list.total} in this view`}
        </AppText>
        {can(PERMISSIONS.INVOICE_WRITE) ? (
          <Button label="New invoice" icon="add" size="sm" onPress={onCreate} />
        ) : null}
      </View>
    </View>
  );

  let empty = (
    <EmptyState
      title={term ? 'No matching invoices' : 'No invoices'}
      description={
        term
          ? `Nothing in this view matches “${term}”.`
          : 'Raise an invoice against a client, a milestone or a change request.'
      }
      icon={term ? 'search' : 'receipt-outline'}
    />
  );
  if (list.isLoading) {
    empty = <LoadingState label="Loading invoices" />;
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
        keyExtractor={(invoice) => invoice.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={list.isRefreshing} onRefresh={list.refresh} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.sm }}
        ListEmptyComponent={empty}
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
        renderItem={({ item }) => <InvoiceCard invoice={item} onPress={() => onOpen(item.id)} />}
      />
    </Screen>
  );
}
