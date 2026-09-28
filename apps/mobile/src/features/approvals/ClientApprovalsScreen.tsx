import { APPROVAL_STATUS, type PortalApprovalSummary } from '@ashniva/types';
import { FlatList, RefreshControl } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { approvalStatusLabel, approvalTone, subjectLine } from './approval-display';

/**
 * What a client has been asked to approve.
 *
 * `GET /portal/approvals` returns one list rather than a page — it is scoped to the caller's own
 * organization and to requests that were actually published, which is a handful, not a backlog.
 * So there is no paging here and no cursor to honour; there is a pull-to-refresh, because the
 * answer changes when the provider publishes something.
 *
 * Whether this person may decide is not guessed here. The list is readable by anyone at the
 * client; the detail screen asks the API, which returns `canDecide` per request.
 */
export function ClientApprovalsScreen({ onOpen }: { onOpen: (approvalId: string) => void }) {
  const theme = useTheme();
  const query = useResource<PortalApprovalSummary[]>(['portal', 'approvals'], '/portal/approvals');
  const approvals = query.data ?? [];
  const refresh = () => void query.refetch();

  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading what needs your approval" />
      </Screen>
    );
  }

  if (query.error && approvals.length === 0) {
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
        data={approvals}
        keyExtractor={(approval) => approval.id}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.screen }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Nothing to approve"
            description="When your team asks you to sign something off, it appears here."
          />
        }
        renderItem={({ item }) => {
          // A published request is the one only this client can move; the brand edge says so
          // before the pill is read.
          const waiting = item.status === APPROVAL_STATUS.PUBLISHED;
          return (
            <PressableCard
              accessibilityLabel={item.title}
              accessibilityHint="Opens the request"
              highlight={waiting}
              onPress={() => onOpen(item.id)}
            >
              <AppText size="xs" tone="faint" numberOfLines={1}>
                {subjectLine(item.subject)}
                {item.project ? ` · ${item.project.name}` : ''}
              </AppText>
              <AppText weight="medium" numberOfLines={2}>
                {item.title}
              </AppText>
              <PillRow>
                <Pill label={approvalStatusLabel(item.status)} tone={approvalTone(item.status)} />
                {waiting ? <Pill label="Waiting for you" tone="warning" /> : null}
                {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
              </PillRow>
              {item.dueDate ? (
                <AppText size="xs" tone="muted">
                  Asked for by {formatDate(item.dueDate)}
                </AppText>
              ) : null}
            </PressableCard>
          );
        }}
      />
    </Screen>
  );
}
