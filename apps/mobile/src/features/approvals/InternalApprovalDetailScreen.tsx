import type { ApprovalDetail } from '@ashniva/types';
import { RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import { Grow, Hero, Section } from '../../shared/components/layout';
import { AppText, Button, Pill, PillRow, Screen } from '../../shared/components/primitives';
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
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Hero
          overline={`${approval.clientOrganization.name} · ${subjectLine(approval.subject)}`}
          title={approval.title}
        >
          <PillRow>
            <Pill
              label={approvalStatusLabel(approval.status)}
              tone={approvalTone(approval.status)}
            />
            {approval.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
          </PillRow>
          <AppText size="sm" tone="muted">
            Raised by {approval.requestedBy.name}
            {approval.dueDate ? ` · due ${formatDate(approval.dueDate)}` : ''}
          </AppText>
        </Hero>

        <Section title="What the client is asked to approve">
          <AppText>{approval.summary}</AppText>
        </Section>

        {/*
          A tinted strip rather than another white card, so the one block the client never sees
          cannot be mistaken for the wording they do.
        */}
        {approval.internalNotes ? (
          <Banner tone="warning" title="Internal notes — the client never sees these">
            <AppText size="sm">{approval.internalNotes}</AppText>
          </Banner>
        ) : null}

        {approval.decidedBy ? (
          <Section title="The client's answer">
            <AppText size="sm">
              {approvalStatusLabel(approval.status)} by {approval.decidedBy.name}
              {approval.decidedAt ? ` · ${formatDateTime(approval.decidedAt)}` : ''}
            </AppText>
            {approval.decisionComment ? <AppText>{approval.decisionComment}</AppText> : null}
          </Section>
        ) : null}

        {/* What can be done comes before the files and the trail: it is why somebody opened this. */}
        <Section title="Actions">
          {buttons.length === 0 ? (
            <AppText size="sm" tone="muted">
              Nothing to do from here. Editing the wording stays on the web app.
            </AppText>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {buttons.map((button) => (
                <Grow key={button.action}>
                  <View style={{ gap: theme.spacing.xs }}>
                    <Button
                      label={button.label}
                      variant={button.action === 'withdraw' ? 'secondary' : 'primary'}
                      loading={transition.busy}
                      disabled={!button.enabled}
                      accessibilityHint={button.reason ?? button.hint}
                      onPress={() => void transition.run({ action: button.action })}
                    />
                    {button.reason ? (
                      <AppText size="xs" tone="muted">
                        {button.reason}
                      </AppText>
                    ) : null}
                  </View>
                </Grow>
              ))}
            </View>
          )}
          {transition.error ? (
            <Banner tone="danger" role="alert">
              {transition.error}
            </Banner>
          ) : null}
        </Section>

        <ApprovalFilesCard files={approval.files} />

        <ApprovalHistoryCard history={approval.history} />
      </ScrollView>
    </Screen>
  );
}
