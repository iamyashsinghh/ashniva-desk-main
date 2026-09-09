import { PERMISSIONS, TICKET_STATUS_LABELS, type TicketSummary } from '@ashniva/types';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { AppText, Button, Card, Pill, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { usePagedResource } from '../../shared/api/queries';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { usePermission } from '../auth/SessionProvider';
import { ticketTone } from './ticket-display';

/**
 * Tickets.
 *
 * The same screen for an internal user and a client. The API returns each of them a different
 * set — a client sees only their own organization's tickets — so there is no branch here, and no
 * possibility of the branch being wrong.
 */
export function TicketsScreen({
  onOpen,
  onRaise,
}: {
  onOpen: (ticketId: string) => void;
  onRaise: () => void;
}) {
  const theme = useTheme();
  const canRaise = usePermission(PERMISSIONS.TICKET_RAISE);
  const list = usePagedResource<TicketSummary>(['tickets'], '/tickets', { limit: 20 });

  if (list.isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading tickets" />
      </Screen>
    );
  }

  if (list.error && list.items.length === 0) {
    return (
      <Screen>
        <ErrorState
          message={list.error instanceof Error ? list.error.message : 'Could not load tickets'}
          offline={list.error instanceof Error && list.error.name === 'NetworkError'}
          onRetry={list.refresh}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {canRaise ? (
        <View style={{ padding: theme.spacing.lg, paddingBottom: 0 }}>
          <Button label="Raise a ticket" onPress={onRaise} accessibilityHint="Opens a new ticket" />
        </View>
      ) : null}

      <FlatList
        data={list.items}
        keyExtractor={(ticket) => ticket.id}
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
          <EmptyState title="No tickets" description="Tickets you can see will appear here." />
        }
        ListFooterComponent={list.isLoadingMore ? <LoadingState label="Loading more" /> : undefined}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.key} ${item.title}`}
            accessibilityHint="Opens the ticket"
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => ({ minHeight: TOUCH_TARGET, opacity: pressed ? 0.7 : 1 })}
          >
            <Card>
              <AppText size="xs" tone="faint">
                {item.key} · {item.priority}
              </AppText>
              <AppText weight="medium" numberOfLines={2}>
                {item.title}
              </AppText>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <Pill label={TICKET_STATUS_LABELS[item.status]} tone={ticketTone(item.status)} />
                {item.sla?.overall === 'BREACHED' ? (
                  <Pill label="SLA breached" tone="danger" />
                ) : null}
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
