import {
  PERMISSIONS,
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketSummary,
} from '@ashniva/types';
import { FlatList, RefreshControl, View } from 'react-native';

import { ListFooterLoader } from '../../shared/components/feedback';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Button, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { usePagedResource } from '../../shared/api/queries';
import { formatSince } from '../../shared/format/format';
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
        <View
          style={{
            alignItems: 'flex-end',
            paddingHorizontal: theme.spacing.screen,
            paddingTop: theme.spacing.md,
          }}
        >
          <Button
            label="Raise a ticket"
            size="sm"
            icon="plus"
            onPress={onRaise}
            accessibilityHint="Opens a new ticket"
          />
        </View>
      ) : null}

      <FlatList
        data={list.items}
        keyExtractor={(ticket) => ticket.id}
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingTop: canRaise ? theme.spacing.sm : theme.spacing.screen,
        }}
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
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
        renderItem={({ item }) => (
          <PressableCard
            accessibilityLabel={`${item.key} ${item.title}`}
            accessibilityHint="Opens the ticket"
            onPress={() => onOpen(item.id)}
          >
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
              <View
                style={{
                  backgroundColor: theme.priority[item.priority],
                  borderRadius: 4,
                  height: 8,
                  width: 8,
                }}
              />
              <AppText size="xs" tone="faint" numberOfLines={1}>
                {item.key} · {PRIORITY_LABELS[item.priority]}
              </AppText>
            </View>
            <AppText weight="medium" numberOfLines={2}>
              {item.title}
            </AppText>
            <PillRow>
              <Pill label={TICKET_STATUS_LABELS[item.status]} tone={ticketTone(item.status)} />
              {item.sla?.overall === 'BREACHED' ? (
                <Pill label="SLA breached" tone="danger" />
              ) : null}
            </PillRow>
            {item.updatedAt ? (
              <AppText size="xs" tone="muted">
                Updated {formatSince(item.updatedAt)}
              </AppText>
            ) : null}
          </PressableCard>
        )}
      />
    </Screen>
  );
}
