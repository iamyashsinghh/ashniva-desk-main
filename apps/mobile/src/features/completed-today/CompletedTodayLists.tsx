import type { ClientUpdateSummary } from '@ashniva/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { View } from 'react-native';

import { Banner } from '../../shared/components/feedback';
import { Button } from '../../shared/components/primitives';
import { QueryState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { EDIT_REFUSED, PUBLISH_REFUSED } from './completed-today';
import { UpdateCard } from './UpdateCard';
import type { ClientUpdateActions } from './use-client-update-actions';

interface ListProps {
  query: UseQueryResult<ClientUpdateSummary[]>;
  canPublish: boolean;
  actions: ClientUpdateActions;
  onOpenTask: (taskId: string) => void;
  onOpenProject?: (projectId: string) => void;
}

function openers({ onOpenTask, onOpenProject }: ListProps) {
  return { onOpenTask, ...(onOpenProject ? { onOpenProject } : {}) };
}

/**
 * Client-visible completions waiting for a senior.
 *
 * Somebody without `client-update:publish` still reads the queue — it is what they did today — but
 * sees the buttons greyed with the reason once, above the list, rather than hidden: a queue that
 * looks publishable to nobody would look broken.
 */
export function QueueList(props: ListProps & { onEdit: (update: ClientUpdateSummary) => void }) {
  const theme = useTheme();
  const { query, canPublish, actions, onEdit } = props;
  const updates = query.data ?? [];

  return (
    <QueryState
      isLoading={query.isLoading}
      error={query.data ? null : query.error}
      isEmpty={updates.length === 0}
      emptyTitle="Nothing waiting to publish"
      emptyDescription="Approved client-visible tasks appear here."
      emptyIcon="checkmark-done-outline"
      onRetry={() => void query.refetch()}
      loadingLabel="Loading the publish queue"
    >
      <View style={{ gap: theme.spacing.sm }}>
        {canPublish ? null : (
          <Banner tone="neutral">{`${PUBLISH_REFUSED}. ${EDIT_REFUSED}.`}</Banner>
        )}
        {updates.map((update) => (
          <UpdateCard key={update.id} update={update} {...openers(props)}>
            <Button
              label="Publish"
              size="sm"
              icon="send-outline"
              disabled={!canPublish || actions.busy}
              loading={actions.activeId === update.id}
              accessibilityHint={canPublish ? 'Publishes it to the client portal' : PUBLISH_REFUSED}
              onPress={() => void actions.publishOne(update.id)}
            />
            <Button
              label="Edit wording"
              size="sm"
              variant="secondary"
              icon="create-outline"
              disabled={!canPublish || actions.busy}
              {...(canPublish ? {} : { accessibilityHint: EDIT_REFUSED })}
              onPress={() => onEdit(update)}
            />
          </UpdateCard>
        ))}
      </View>
    </QueryState>
  );
}

/** What the client already sees for the chosen day. Withdraw is offered only to publishers. */
export function PublishedList(props: ListProps) {
  const theme = useTheme();
  const { query, canPublish, actions } = props;
  const updates = query.data ?? [];

  return (
    <QueryState
      isLoading={query.isLoading}
      error={query.data ? null : query.error}
      isEmpty={updates.length === 0}
      emptyTitle="Nothing published for this day"
      emptyIcon="eye-off-outline"
      onRetry={() => void query.refetch()}
      loadingLabel="Loading what clients see"
    >
      <View style={{ gap: theme.spacing.sm }}>
        {updates.map((update) => (
          <UpdateCard key={update.id} update={update} {...openers(props)}>
            {canPublish ? (
              <Button
                label="Withdraw"
                size="sm"
                variant="dangerGhost"
                icon="arrow-undo-outline"
                disabled={actions.busy}
                loading={actions.activeId === update.id}
                accessibilityHint="Takes it back off the client portal"
                onPress={() => void actions.withdrawOne(update.id)}
              />
            ) : null}
          </UpdateCard>
        ))}
      </View>
    </QueryState>
  );
}
