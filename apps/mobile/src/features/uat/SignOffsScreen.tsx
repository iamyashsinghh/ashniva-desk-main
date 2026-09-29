import { type UatRequestSummary } from '@ashniva/types';
import { FlatList } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { MetaLine } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatSince } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { isAwaitingDecision, uatStatusLabel, uatStatusMark, uatStatusTone } from './uat-display';
import { PullRefresh } from '../../shared/components/PullRefresh';

/**
 * What the client has been asked to try and sign off.
 *
 * `GET /portal/uat` returns the caller's organization's own requests, and the shape it returns is
 * the guarantee: no staging URL a client should not have, no pull request, no test account, no
 * internal note. Reading it needs `project:read`, which every client role holds — deciding needs
 * `uat:decide`, which only a client admin does, and that is checked on the detail screen's form
 * rather than assumed here.
 *
 * The list is not paged because the endpoint does not page: it is what is open plus what was
 * recently answered, not an archive.
 */
export function SignOffsScreen({ onOpen }: { onOpen: (requestId: string) => void }) {
  const theme = useTheme();
  const query = useResource<UatRequestSummary[]>(['portal', 'uat'], '/portal/uat');
  const requests = query.data ?? [];
  const refresh = () => void query.refetch();

  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading your sign-offs" />
      </Screen>
    );
  }

  if (query.error && requests.length === 0) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={refresh}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={requests}
        keyExtractor={(request) => request.id}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.screen }}
        refreshControl={
          <PullRefresh
            busy={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Nothing to sign off"
            description="When your team finishes something for you to try, it appears here."
            icon="ribbon-outline"
            iconTone="success"
          />
        }
        renderItem={({ item }) => (
          <PressableCard
            accessibilityLabel={item.summaryPlain}
            accessibilityHint="Opens the sign-off"
            highlight={isAwaitingDecision(item.status)}
            onPress={() => onOpen(item.id)}
            {...uatStatusMark(item.status)}
          >
            <MetaLine icon="time-outline">Asked {formatSince(item.createdAt)}</MetaLine>
            <AppText weight="medium" numberOfLines={3}>
              {item.summaryPlain}
            </AppText>
            <PillRow>
              <Pill label={uatStatusLabel(item.status)} tone={uatStatusTone(item.status)} />
              {isAwaitingDecision(item.status) && item.checklist.length > 0 ? (
                <Pill label={`${item.checklist.length} things to check`} />
              ) : null}
            </PillRow>
          </PressableCard>
        )}
      />
    </Screen>
  );
}
