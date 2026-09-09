import { APPROVAL_STATUS, type PortalApprovalDetail } from '@ashniva/types';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { AppText, Card, Pill, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate, formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { approvalStatusLabel, approvalTone, subjectLine } from './approval-display';
import { ApprovalDecisionForm } from './ApprovalDecisionForm';
import { ApprovalFilesCard, ApprovalHistoryCard } from './ApprovalHistoryCard';

/**
 * One request, as the client reads it.
 *
 * The DTO is built by an allow-list mapper: there is no internal note, no requester email and no
 * other client's work in it, and the shape is the guarantee rather than a filter drawn here.
 *
 * `canDecide` comes from the API and is the only thing that puts the form on the screen. It is
 * not authority — the three routes behind the form each need `approval:decide` and each refuse
 * the person who raised or published the request — it is what stops a colleague without the
 * permission being shown a form that would answer 403.
 */
export function ClientApprovalDetailScreen({ approvalId }: { approvalId: string }) {
  const theme = useTheme();
  const query = useResource<PortalApprovalDetail>(
    ['portal', 'approvals', approvalId],
    `/portal/approvals/${approvalId}`,
  );
  const approval = query.data ?? null;
  const refresh = () => void query.refetch();

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

  const waiting = approval.status === APPROVAL_STATUS.PUBLISHED;

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
          keyboardShouldPersistTaps="handled"
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
              {subjectLine(approval.subject)}
              {approval.project ? ` · ${approval.project.name}` : ''}
            </AppText>
            <AppText size="lg" weight="bold">
              {approval.title}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              <Pill
                label={approvalStatusLabel(approval.status)}
                tone={approvalTone(approval.status)}
              />
              {waiting ? <Pill label="Waiting for you" tone="warning" /> : null}
              {approval.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
            </View>
            {approval.dueDate ? (
              <AppText size="sm" tone="muted">
                Asked for by {formatDate(approval.dueDate)}
              </AppText>
            ) : null}
          </Card>

          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              What you are being asked to approve
            </AppText>
            <AppText>{approval.summary}</AppText>
          </Card>

          {approval.decidedBy ? (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                Your answer
              </AppText>
              <AppText size="sm">
                {approvalStatusLabel(approval.status)} by {approval.decidedBy.name}
                {approval.decidedAt ? ` · ${formatDateTime(approval.decidedAt)}` : ''}
              </AppText>
              {approval.decisionComment ? <AppText>{approval.decisionComment}</AppText> : null}
            </Card>
          ) : null}

          <ApprovalFilesCard files={approval.files} />

          {approval.canDecide ? (
            <ApprovalDecisionForm approvalId={approval.id} onDecided={refresh} />
          ) : (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                Your decision
              </AppText>
              <AppText tone="muted">
                {waiting
                  ? 'Somebody with approval rights at your organization has to answer this one.'
                  : 'This request has already been answered.'}
              </AppText>
            </Card>
          )}

          <ApprovalHistoryCard history={approval.history} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
