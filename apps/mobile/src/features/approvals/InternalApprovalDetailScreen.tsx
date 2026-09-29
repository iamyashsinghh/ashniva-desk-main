import { APPROVAL_STATUS, PERMISSIONS, type ApprovalDetail } from '@ashniva/types';
import { ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { useResource } from '../../shared/api/queries';
import { MetaLine } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Hero, Section } from '../../shared/components/layout';
import { AppText, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import {
  approvalStatusIcon,
  approvalStatusLabel,
  approvalTone,
  subjectLine,
} from './approval-display';
import { ApprovalActionsSection } from './ApprovalActionsSection';
import { ApprovalDetailsSection } from './ApprovalDetailsSection';
import { ApprovalFiles } from './ApprovalFiles';
import { ApprovalHistoryCard } from './ApprovalHistoryCard';

/**
 * One approval request, on the provider's side — everything the web page shows.
 *
 * What can be done comes straight after what is being asked: it is why somebody opened this. The
 * buttons are the API's `actions`, drawn disabled with the API's reason when refused. Files can be
 * added while the request is still a draft, which is the same rule the web page applies: once the
 * client has been shown a request, what it asked them to approve does not change underneath them.
 */
export function InternalApprovalDetailScreen({
  approvalId,
  onOpenProject,
}: {
  approvalId: string;
  onOpenProject?: (projectId: string) => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const query = useResource<ApprovalDetail>(['approvals', approvalId], `/approvals/${approvalId}`);
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

  const canUpload = can(PERMISSIONS.APPROVAL_MANAGE) && approval.status === APPROVAL_STATUS.DRAFT;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh
            busy={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Hero
          overline={`${approval.clientOrganization.name} · ${subjectLine(approval.subject)}`}
          title={approval.title}
          icon="shield-checkmark"
          iconTone={approvalStatusIcon(approval.status).tone}
        >
          <PillRow>
            <Pill
              label={approvalStatusLabel(approval.status)}
              tone={approvalTone(approval.status)}
            />
            {approval.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
          </PillRow>
          <MetaLine icon="person-outline">
            Raised by {approval.requestedBy.name}
            {approval.dueDate ? ` · due ${formatDate(approval.dueDate)}` : ''}
          </MetaLine>
        </Hero>

        <Section title="What the client is asked to approve" icon="document-text-outline">
          <Pill label="The client sees this" tone="success" />
          <AppText>{approval.summary}</AppText>
        </Section>

        <ApprovalActionsSection approval={approval} onChanged={refresh} />

        {approval.decisionComment || approval.decidedBy ? (
          <Section title="The client's answer" icon="chatbox-ellipses-outline">
            {approval.decidedBy ? (
              <AppText size="sm" tone="muted">
                {approvalStatusLabel(approval.status)} by {approval.decidedBy.name}
              </AppText>
            ) : null}
            {approval.decisionComment ? <AppText>{approval.decisionComment}</AppText> : null}
          </Section>
        ) : null}

        {/*
          A tinted strip rather than another white card, so the one block the client never sees
          cannot be mistaken for the wording they do.
        */}
        {approval.internalNotes ? (
          <Banner tone="warning" title="Internal notes — the client never sees these">
            <AppText size="sm">{approval.internalNotes}</AppText>
          </Banner>
        ) : null}

        <ApprovalDetailsSection approval={approval} {...(onOpenProject ? { onOpenProject } : {})} />

        <ApprovalFiles
          files={approval.files}
          approvalId={approval.id}
          canUpload={canUpload}
          showAudience
          onUploaded={refresh}
        />

        <ApprovalHistoryCard history={approval.history} />
      </ScrollView>
    </Screen>
  );
}
