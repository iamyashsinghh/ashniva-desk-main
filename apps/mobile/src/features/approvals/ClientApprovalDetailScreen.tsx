import { APPROVAL_STATUS, type PortalApprovalDetail } from '@ashniva/types';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Hero, Section, useStackKeyboardOffset } from '../../shared/components/layout';
import { AppText, Pill, PillRow, Screen } from '../../shared/components/primitives';
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
  const keyboardOffset = useStackKeyboardOffset();
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
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            gap: theme.spacing.md,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={refresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Hero
            overline={`${subjectLine(approval.subject)}${approval.project ? ` · ${approval.project.name}` : ''}`}
            title={approval.title}
          >
            <PillRow>
              <Pill
                label={approvalStatusLabel(approval.status)}
                tone={approvalTone(approval.status)}
              />
              {waiting ? <Pill label="Waiting for you" tone="warning" /> : null}
              {approval.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
            </PillRow>
            {approval.dueDate ? (
              <AppText size="sm" tone="muted">
                Asked for by {formatDate(approval.dueDate)}
              </AppText>
            ) : null}
          </Hero>

          <Section title="What you are being asked to approve">
            <AppText>{approval.summary}</AppText>
          </Section>

          {approval.decidedBy ? (
            <Section title="Your answer">
              <AppText size="sm">
                {approvalStatusLabel(approval.status)} by {approval.decidedBy.name}
                {approval.decidedAt ? ` · ${formatDateTime(approval.decidedAt)}` : ''}
              </AppText>
              {approval.decisionComment ? <AppText>{approval.decisionComment}</AppText> : null}
            </Section>
          ) : null}

          {/* The decision is why a client opens this, so it sits above the files and the trail. */}
          {approval.canDecide ? (
            <ApprovalDecisionForm approvalId={approval.id} onDecided={refresh} />
          ) : (
            <Section title="Your decision">
              <AppText size="sm" tone="muted">
                {waiting
                  ? 'Somebody with approval rights at your organization has to answer this one.'
                  : 'This request has already been answered.'}
              </AppText>
            </Section>
          )}

          <ApprovalFilesCard files={approval.files} />

          <ApprovalHistoryCard history={approval.history} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
