import { INVOICE_STATUS_LABELS, type PortalInvoiceSummary } from '@ashniva/types';
import { FlatList } from 'react-native';

import { usePagedResource } from '../../shared/api/queries';
import { MetaLine } from '../../shared/components/data-display';
import { ListFooterLoader } from '../../shared/components/feedback';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { invoiceDate } from './invoice-dates';
import { invoiceIconTone, invoiceTone } from './invoice-display';
import { PullRefresh } from '../../shared/components/PullRefresh';

/**
 * A client's own invoices.
 *
 * Every amount is printed as the string the API sent. Parsing it into a number to format it would
 * reintroduce exactly the floating-point error the API went to some trouble to avoid.
 */
export function InvoicesScreen({ onOpen }: { onOpen: (invoiceId: string) => void }) {
  const theme = useTheme();
  const list = usePagedResource<PortalInvoiceSummary>(['portal', 'invoices'], '/portal/invoices', {
    limit: 20,
  });

  if (list.isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading your invoices" />
      </Screen>
    );
  }

  if (list.error && list.items.length === 0) {
    return (
      <Screen>
        <ErrorState
          message={list.error instanceof Error ? list.error.message : 'Could not load invoices'}
          offline={list.error instanceof Error && list.error.name === 'NetworkError'}
          onRetry={list.refresh}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={list.items}
        keyExtractor={(invoice) => invoice.id}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.screen }}
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
          <EmptyState
            title="No invoices"
            description="Issued invoices will appear here."
            icon="receipt-outline"
          />
        }
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
        renderItem={({ item }) => (
          <PressableCard
            accessibilityLabel={`Invoice ${item.numberLabel}, ${item.currency} ${item.total}`}
            accessibilityHint="Opens the invoice"
            onPress={() => onOpen(item.id)}
            highlight={item.isOverdue}
            icon="receipt"
            iconTone={invoiceIconTone(item.status, item.isOverdue)}
          >
            <AppText size="xs" tone="faint" numberOfLines={1}>
              {item.numberLabel}
            </AppText>
            <AppText variant="heading" weight="bold" tabular>
              {item.currency} {item.total}
            </AppText>
            <PillRow>
              <Pill label={INVOICE_STATUS_LABELS[item.status]} tone={invoiceTone(item.status)} />
              {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
            </PillRow>
            <MetaLine icon="calendar-outline" danger={item.isOverdue}>
              Issued {invoiceDate(item.issueDate)} · due {invoiceDate(item.dueDate)}
            </MetaLine>
          </PressableCard>
        )}
      />
    </Screen>
  );
}
