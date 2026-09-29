import type { PortalTicketSummary, TicketSummary } from '@ashniva/types';
import type { ReactElement } from 'react';
import { FlatList } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { usePagedResource, type PagedResult } from '../../shared/api/queries';
import { ListFooterLoader } from '../../shared/components/feedback';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { isClientUser } from '../auth/audience';
import { useSession } from '../auth/SessionProvider';
import { PortalTicketRow, TicketRow } from './TicketRow';
import { PullRefresh } from '../../shared/components/PullRefresh';

export type TicketListResult =
  | { client: false; list: PagedResult<TicketSummary> }
  | { client: true; list: PagedResult<PortalTicketSummary> };

/**
 * A ticket list for whoever is signed in.
 *
 * A client reads `/portal/tickets`, which is built by an allow-list mapper and carries only the
 * client-visible status; staff read `/tickets`. Both hooks are always called, one of them
 * disabled, so the choice never changes the order of hooks between renders — and neither runs
 * before the session is known, so a client is never sent to `/tickets` while it loads.
 */
export function useTicketList(query: Readonly<Record<string, string>>): TicketListResult {
  const { user } = useSession();
  const client = isClientUser(user);
  const params = { ...query, limit: '20' };
  const internal = usePagedResource<TicketSummary>(
    ['tickets', 'list', params],
    '/tickets',
    params,
    user !== null && !client,
  );
  const portal = usePagedResource<PortalTicketSummary>(
    ['tickets', 'portal-list', params],
    '/portal/tickets',
    params,
    client,
  );
  return client ? { client: true, list: portal } : { client: false, list: internal };
}

/** The list itself, with its loading, failure, empty and paging states. */
export function TicketListBody({
  result,
  onOpen,
  header,
  emptyTitle = 'No tickets',
  emptyDescription = 'Tickets you can see will appear here.',
}: {
  result: TicketListResult;
  onOpen: (ticketId: string) => void;
  /** Scrolls with the list, above the first row. */
  header?: ReactElement;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const theme = useTheme();
  const { list } = result;

  if (list.isLoading) {
    return <LoadingState label="Loading tickets" />;
  }
  if (list.error && list.items.length === 0) {
    return (
      <ErrorState
        message={errorMessage(list.error)}
        offline={list.error instanceof Error && list.error.name === 'NetworkError'}
        onRetry={list.refresh}
      />
    );
  }

  const shared = {
    keyExtractor: (ticket: { id: string }) => ticket.id,
    contentContainerStyle: { gap: theme.spacing.sm, padding: theme.spacing.screen },
    keyboardShouldPersistTaps: 'handled' as const,
    refreshControl: (
      <PullRefresh
        busy={list.isRefreshing}
        onRefresh={list.refresh}
        tintColor={theme.colors.primary}
      />
    ),
    onEndReached: list.loadMore,
    onEndReachedThreshold: 0.4,
    ListHeaderComponent: header ?? null,
    ListEmptyComponent: (
      <EmptyState title={emptyTitle} description={emptyDescription} icon="ticket-outline" />
    ),
    ListFooterComponent: list.isLoadingMore ? <ListFooterLoader /> : null,
  };

  return result.client ? (
    <FlatList
      {...shared}
      data={result.list.items}
      renderItem={({ item }) => <PortalTicketRow ticket={item} onPress={() => onOpen(item.id)} />}
    />
  ) : (
    <FlatList
      {...shared}
      data={result.list.items}
      renderItem={({ item }) => <TicketRow ticket={item} onPress={() => onOpen(item.id)} />}
    />
  );
}
