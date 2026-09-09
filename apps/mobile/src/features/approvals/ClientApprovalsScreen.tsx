import { APPROVAL_STATUS, type PortalApprovalSummary } from '@ashniva/types';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { AppText, Card, Pill, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
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
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}
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
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            accessibilityHint="Opens the request"
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => ({ minHeight: TOUCH_TARGET, opacity: pressed ? 0.7 : 1 })}
          >
            <Card>
              <AppText size="xs" tone="faint">
                {subjectLine(item.subject)}
                {item.project ? ` · ${item.project.name}` : ''}
              </AppText>
              <AppText weight="medium" numberOfLines={2}>
                {item.title}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                <Pill label={approvalStatusLabel(item.status)} tone={approvalTone(item.status)} />
                {item.status === APPROVAL_STATUS.PUBLISHED ? (
                  <Pill label="Waiting for you" tone="warning" />
                ) : null}
                {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
              </View>
              {item.dueDate ? (
                <AppText size="xs" tone="muted">
                  Asked for by {formatDate(item.dueDate)}
                </AppText>
              ) : null}
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
