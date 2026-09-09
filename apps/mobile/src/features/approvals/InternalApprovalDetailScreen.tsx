import type { ApprovalDetail } from '@ashniva/types';
import { RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { AppText, Button, Card, Pill, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate, formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  approvalButtons,
  approvalStatusLabel,
  approvalTone,
  subjectLine,
} from './approval-display';
import { ApprovalFilesCard, ApprovalHistoryCard } from './ApprovalHistoryCard';

/**
 * One approval request, on the provider's side.
 *
 * Read plus the transitions the API offered, which for this aggregate are all statements about
 * where the request has got to rather than judgements about somebody's work: send it for review,
 * publish it, take it back, withdraw it. Editing the wording is not here — see
 * `approval-display.ts`.
 */
export function InternalApprovalDetailScreen({ approvalId }: { approvalId: string }) {
  const theme = useTheme();
  const query = useResource<ApprovalDetail>(['approvals', approvalId], `/approvals/${approvalId}`);
  const approval = query.data ?? null;
  const refresh = () => void query.refetch();

  const transition = useApiMutation<{ action: string }, ApprovalDetail>({
    path: (variables) => `/approvals/${approvalId}/${variables.action}`,
    invalidate: [['approvals', approvalId], ['approvals']],
    onSuccess: refresh,
  });

  if (!approval && query.error) {
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
  if (!approval) {
    return (
      <Screen>
        <LoadingState label="Loading the request" />
      </Screen>
    );
  }

  const buttons = approvalButtons(approval.actions);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Card>
          <AppText size="xs" tone="faint">
            {approval.clientOrganization.name} · {subjectLine(approval.subject)}
          </AppText>
          <AppText size="lg" weight="bold">
            {approval.title}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Pill
              label={approvalStatusLabel(approval.status)}
              tone={approvalTone(approval.status)}
            />
            {approval.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
          </View>
          <AppText size="sm" tone="muted">
            Raised by {approval.requestedBy.name}
            {approval.dueDate ? ` · due ${formatDate(approval.dueDate)}` : ''}
          </AppText>
        </Card>

        <Card>
          <AppText size="sm" tone="muted" weight="medium">
            What the client is asked to approve
          </AppText>
          <AppText>{approval.summary}</AppText>
        </Card>

        {approval.internalNotes ? (
          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              Internal notes — the client never sees these
            </AppText>
            <AppText>{approval.internalNotes}</AppText>
          </Card>
        ) : null}

        {approval.decidedBy ? (
          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              The client&apos;s answer
            </AppText>
            <AppText size="sm">
              {approvalStatusLabel(approval.status)} by {approval.decidedBy.name}
              {approval.decidedAt ? ` · ${formatDateTime(approval.decidedAt)}` : ''}
            </AppText>
            {approval.decisionComment ? <AppText>{approval.decisionComment}</AppText> : null}
          </Card>
        ) : null}

        <ApprovalFilesCard files={approval.files} />

        <Card>
          <AppText size="sm" tone="muted" weight="medium">
            Actions
          </AppText>
          {buttons.length === 0 ? (
            <AppText tone="muted">
              Nothing to do from here. Editing the wording stays on the web app.
            </AppText>
          ) : (
            buttons.map((button) => (
              <View key={button.action} style={{ gap: theme.spacing.xs }}>
                <Button
                  label={button.label}
                  variant={button.action === 'withdraw' ? 'secondary' : 'primary'}
                  loading={transition.busy}
                  disabled={!button.enabled}
                  accessibilityHint={button.reason ?? button.hint}
                  onPress={() => void transition.run({ action: button.action })}
                />
                {button.reason ? (
                  <AppText size="xs" tone="faint">
                    {button.reason}
                  </AppText>
                ) : null}
              </View>
            ))
          )}
          {transition.error ? (
            <AppText tone="danger" size="sm">
              {transition.error}
            </AppText>
          ) : null}
        </Card>

        <ApprovalHistoryCard history={approval.history} />
      </ScrollView>
    </Screen>
  );
}
