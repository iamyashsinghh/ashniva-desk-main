import { APPROVAL_STATUS, type PortalApprovalDetail } from '@ashniva/types';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { useResource } from '../../shared/api/queries';
import { KeyValueRow, ListRow, MetaLine } from '../../shared/components/data-display';
import { Hero, Section, useStackKeyboardOffset } from '../../shared/components/layout';
import { AppText, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate, formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  approvalStatusIcon,
  approvalStatusLabel,
  approvalTone,
  byLine,
  subjectLine,
} from './approval-display';
import { ApprovalDecisionForm } from './ApprovalDecisionForm';
import { ApprovalFiles } from './ApprovalFiles';
import { ApprovalHistoryCard } from './ApprovalHistoryCard';

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
export function ClientApprovalDetailScreen({
  approvalId,
  onOpenProject,
}: {
  approvalId: string;
  onOpenProject?: (projectId: string) => void;
}) {
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
  const project = approval.project;

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
            <PullRefresh
              busy={query.isRefetching}
              onRefresh={refresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Hero
            overline={`${subjectLine(approval.subject)}${project ? ` · ${project.name}` : ''}`}
            title={approval.title}
            icon="shield-checkmark"
            iconTone={approvalStatusIcon(approval.status).tone}
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
              <MetaLine icon="alarm-outline" danger={approval.isOverdue}>
                Asked for by {formatDate(approval.dueDate)}
              </MetaLine>
            ) : null}
          </Hero>

          <Section title="What you are being asked to approve" icon="document-text-outline">
            <AppText>{approval.summary}</AppText>
            {project && onOpenProject ? (
              <ListRow
                title={project.name}
                subtitle="Project"
                icon="folder-open-outline"
                iconTone="info"
                onPress={() => onOpenProject(project.id)}
              />
            ) : null}
          </Section>

          {approval.decidedBy ? (
            <Section title="Your answer" icon="chatbox-ellipses-outline">
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
            <Section title="Your decision" icon="hand-left-outline">
              <AppText size="sm" tone="muted">
                {approval.decidedBy
                  ? `Decided by ${approval.decidedBy.name} on ${formatDate(approval.decidedAt) ?? '—'}.`
                  : 'Only a client administrator can decide this request.'}
              </AppText>
            </Section>
          )}

          <Section title="Details" icon="information-circle-outline">
            <KeyValueRow label="Published" value={formatDateTime(approval.publishedAt) ?? '—'} />
            <KeyValueRow
              label="Decision needed by"
              value={formatDate(approval.dueDate) ?? '—'}
              {...(approval.isOverdue ? { tone: 'danger' as const } : {})}
            />
            <KeyValueRow label="Decided" value={byLine(approval.decidedBy, approval.decidedAt)} />
          </Section>

          <ApprovalFiles files={approval.files} approvalId={approval.id} />

          <ApprovalHistoryCard history={approval.history} clientSide />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
