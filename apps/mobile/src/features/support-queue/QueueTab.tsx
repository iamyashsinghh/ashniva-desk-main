import { PERMISSIONS, type UnassignedTicketSummary } from '@ashniva/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList } from 'react-native';

import { errorMessage, isOffline } from '../../shared/api/client';
import { AppText } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { QueueCard } from './QueueCard';
import { ReassignSheet } from './ReassignSheet';
import { RoutingSheet } from './RoutingSheet';
import { PullRefresh } from '../../shared/components/PullRefresh';

/**
 * Everything nobody is working on.
 *
 * This list is what makes "a ticket is never dropped" true rather than merely intended: a ticket
 * the router could not place has to land somewhere a person looks, with the reason on it so that
 * looking is useful. Reassigning needs `ticket:reassign` on top of the queue's own permission.
 */
export function QueueTab({
  queue,
  onOpenTicket,
}: {
  queue: UseQueryResult<UnassignedTicketSummary[]>;
  onOpenTicket: (id: string) => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const canReassign = can(PERMISSIONS.TICKET_REASSIGN);
  const [reassigning, setReassigning] = useState<UnassignedTicketSummary | null>(null);
  const [inspecting, setInspecting] = useState<UnassignedTicketSummary | null>(null);

  if (queue.isLoading) {
    return <LoadingState label="Loading the support queue" />;
  }
  if (queue.error && !queue.data) {
    return (
      <ErrorState
        message={errorMessage(queue.error)}
        offline={isOffline(queue.error)}
        onRetry={() => void queue.refetch()}
      />
    );
  }

  return (
    <>
      <FlatList
        data={queue.data ?? []}
        keyExtractor={(ticket) => ticket.id}
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.screen }}
        refreshControl={
          <PullRefresh
            busy={queue.isRefetching}
            onRefresh={() => void queue.refetch()}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <AppText size="sm" tone="muted">
            Open tickets with nobody on them, and why the router left each one here.
          </AppText>
        }
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-done-outline"
            iconTone="success"
            title="Nothing waiting"
            description="Every open ticket has somebody on it."
          />
        }
        renderItem={({ item }) => (
          <QueueCard
            ticket={item}
            canReassign={canReassign}
            onOpen={() => onOpenTicket(item.id)}
            onReassign={() => setReassigning(item)}
            onRouting={() => setInspecting(item)}
          />
        )}
      />
      {reassigning ? (
        <ReassignSheet
          key={reassigning.id}
          ticket={reassigning}
          onClose={() => setReassigning(null)}
          onDone={() => setReassigning(null)}
        />
      ) : null}
      {inspecting ? (
        <RoutingSheet
          key={inspecting.id}
          ticket={inspecting}
          onClose={() => setInspecting(null)}
          onOpenTicket={() => {
            setInspecting(null);
            onOpenTicket(inspecting.id);
          }}
        />
      ) : null}
    </>
  );
}
