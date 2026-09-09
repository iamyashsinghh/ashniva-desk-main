import { APPROVAL_LIST_VIEW, type ApprovalListView, type ApprovalSummary } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { usePagedResource } from '../../shared/api/queries';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Card, Pill, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  PHONE_APPROVAL_VIEWS,
  approvalStatusLabel,
  approvalTone,
  subjectLine,
} from './approval-display';

/**
 * The provider's side of client approvals.
 *
 * `GET /approvals` is cursor-paged, so this pages: a manager with four months of decided requests
 * behind them should be able to scroll past the first twenty rather than be told that is all
 * there is.
 *
 * The empty state names the view rather than the screen. "No approvals" under a filter that
 * happens to be empty reads as though the feature is broken.
 */
export function InternalApprovalsScreen({ onOpen }: { onOpen: (approvalId: string) => void }) {
  const theme = useTheme();
  const [view, setView] = useState<ApprovalListView>(APPROVAL_LIST_VIEW.INBOX);
  const list = usePagedResource<ApprovalSummary>(['approvals', view], '/approvals', {
    view,
    limit: 20,
  });

  const header = (
    <View style={{ padding: theme.spacing.lg, paddingBottom: 0 }}>
      <Segmented
        options={PHONE_APPROVAL_VIEWS}
        value={view}
        onChange={setView}
        label="Which approval requests to show"
      />
    </View>
  );

  if (list.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading approval requests" />
      </Screen>
    );
  }

  if (list.error) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={errorMessage(list.error)}
          offline={list.error instanceof Error && list.error.name === 'NetworkError'}
          onRetry={list.refresh}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <FlatList
        data={list.items}
        keyExtractor={(approval) => approval.id}
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
        ListEmptyComponent={<EmptyState title={EMPTY[view].title} description={EMPTY[view].body} />}
        ListFooterComponent={list.isLoadingMore ? <LoadingState label="Loading more" /> : undefined}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            accessibilityHint="Opens the approval request"
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => ({ minHeight: TOUCH_TARGET, opacity: pressed ? 0.7 : 1 })}
          >
            <Card>
              <AppText size="xs" tone="faint">
                {item.clientOrganization.name} · {subjectLine(item.subject)}
              </AppText>
              <AppText weight="medium" numberOfLines={2}>
                {item.title}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                <Pill label={approvalStatusLabel(item.status)} tone={approvalTone(item.status)} />
                {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
              </View>
              {item.dueDate ? (
                <AppText size="xs" tone="muted">
                  Due {formatDate(item.dueDate)}
                </AppText>
              ) : null}
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const EMPTY: Record<ApprovalListView, { title: string; body: string }> = {
  [APPROVAL_LIST_VIEW.INBOX]: {
    title: 'Nothing waiting on you',
    body: 'Requests you have to prepare or publish appear here.',
  },
  [APPROVAL_LIST_VIEW.WAITING_CLIENT]: {
    title: 'Nothing with the client',
    body: 'Published requests appear here until the client answers.',
  },
  [APPROVAL_LIST_VIEW.DECIDED]: {
    title: 'Nothing decided yet',
    body: 'Approved, rejected and returned requests appear here.',
  },
  [APPROVAL_LIST_VIEW.MINE]: { title: 'Nothing here', body: 'This view is empty right now.' },
  [APPROVAL_LIST_VIEW.ALL]: { title: 'Nothing here', body: 'This view is empty right now.' },
};
