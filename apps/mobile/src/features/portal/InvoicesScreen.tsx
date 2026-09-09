import { INVOICE_STATUS_LABELS, type PortalInvoiceSummary } from '@ashniva/types';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { AppText, Card, Pill, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { usePagedResource } from '../../shared/api/queries';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { invoiceTone } from './invoice-display';

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
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefreshing}
            onRefresh={list.refresh}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <EmptyState title="No invoices" description="Issued invoices will appear here." />
        }
        ListFooterComponent={list.isLoadingMore ? <LoadingState label="Loading more" /> : undefined}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Invoice ${item.numberLabel}, ${item.currency} ${item.total}`}
            accessibilityHint="Opens the invoice"
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => ({ minHeight: TOUCH_TARGET, opacity: pressed ? 0.7 : 1 })}
          >
            <Card>
              <AppText weight="medium">{item.numberLabel}</AppText>
              <AppText size="xs" tone="faint">
                Issued {item.issueDate} · due {item.dueDate}
              </AppText>
              <AppText size="lg" weight="bold">
                {item.currency} {item.total}
              </AppText>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <Pill label={INVOICE_STATUS_LABELS[item.status]} tone={invoiceTone(item.status)} />
                {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
