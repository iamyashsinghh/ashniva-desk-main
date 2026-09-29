import {
  AI_SUMMARY_STATUS,
  AI_SUMMARY_TYPE_LABELS,
  PERMISSIONS,
  isClientFacingSummary,
  type AiSummaryDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { MetaLine } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Hero } from '../../shared/components/layout';
import { Pill, PillRow, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { useAiProviderStatus, useAiSummary } from './api';
import { summaryPeriod } from './SummaryCard';
import { SummaryActions } from './SummaryActions';
import {
  isEditable,
  summaryIconTone,
  summaryStatusLabel,
  summaryStatusTone,
} from './summary-display';
import { SummaryProvenance, SummaryRuns, SummaryVersions } from './SummaryHistory';
import { SummarySources } from './SummarySources';
import { SummaryTextPanel } from './SummaryTextPanel';

/** The review screen: the generated text, what it was built from, and who signed it off. */
export function AiSummaryDetailScreen({ summaryId }: { summaryId: string }) {
  const { can } = useSession();
  const canRead = can(PERMISSIONS.AI_SUMMARY_READ);
  // Re-read while generating: the queue finishes the run, and this screen should show it.
  const [polling, setPolling] = useState(false);
  const query = useAiSummary(summaryId, polling, canRead);
  const provider = useAiProviderStatus(canRead);
  const generating = query.data?.status === AI_SUMMARY_STATUS.GENERATING;
  if (generating !== polling) {
    setPolling(generating);
  }

  if (!canRead) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          description="Progress summaries need the ai-summary:read permission."
        />
      </Screen>
    );
  }
  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading the summary" />
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Loaded
      summary={query.data}
      refreshing={query.isRefetching && !polling}
      onRefresh={() => void query.refetch()}
      providerConfigured={provider.data ? provider.data.configured : true}
    />
  );
}

function Loaded({
  summary,
  refreshing,
  onRefresh,
  providerConfigured,
}: {
  summary: AiSummaryDetail;
  refreshing: boolean;
  onRefresh: () => void;
  providerConfigured: boolean;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const clientFacing = isClientFacingSummary(summary.type);
  const editable = isEditable(summary.status) && can(PERMISSIONS.AI_SUMMARY_GENERATE);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={refreshing} onRefresh={onRefresh} />}
      >
        <Hero
          overline={AI_SUMMARY_TYPE_LABELS[summary.type]}
          title={summary.title}
          icon="sparkles-outline"
          iconTone={summaryIconTone(summary.status)}
        >
          <MetaLine icon="calendar-outline">{summaryPeriod(summary)}</MetaLine>
          {summary.projectCode ? (
            <MetaLine icon="folder-outline">{summary.projectCode}</MetaLine>
          ) : null}
          {summary.subjectUserName ? (
            <MetaLine icon="person-outline">{summary.subjectUserName}</MetaLine>
          ) : null}
          {summary.clientOrganizationName ? (
            <MetaLine icon="business-outline">{summary.clientOrganizationName}</MetaLine>
          ) : null}
          <PillRow>
            <Pill
              label={summaryStatusLabel(summary.status)}
              tone={summaryStatusTone(summary.status)}
            />
            {summary.isDraftOutput ? (
              <Pill label="Draft — not approved by a person" tone="warning" />
            ) : null}
            {clientFacing ? null : <Pill label="Internal only" tone="neutral" />}
          </PillRow>
        </Hero>

        {summary.status === AI_SUMMARY_STATUS.GENERATING ? (
          <Banner tone="info" title="Generating">
            This page updates by itself when the run finishes.
          </Banner>
        ) : null}
        {summary.missingDataNote ? <Banner tone="warning">{summary.missingDataNote}</Banner> : null}
        {summary.reviewNote ? (
          <Banner tone="warning" title="Changes requested">
            {summary.reviewNote}
          </Banner>
        ) : null}
        {summary.cancelReason ? (
          <Banner tone="neutral" title="Cancelled">
            {summary.cancelReason}
          </Banner>
        ) : null}

        <SummaryTextPanel
          summaryId={summary.id}
          field="internalContent"
          title="Internal version"
          hint="What the team reads. Never sent to a client."
          value={summary.internalContent}
          editable={editable}
          internal
        />
        {clientFacing ? (
          <SummaryTextPanel
            summaryId={summary.id}
            field="clientContent"
            title="Client version"
            hint="This is the text that gets published, once it is approved."
            value={summary.clientContent}
            editable={editable}
          />
        ) : null}

        <SummarySources summaryId={summary.id} generatedAt={summary.generatedAt} />
        <SummaryProvenance summary={summary} />
        <SummaryVersions summary={summary} />
        <SummaryRuns summary={summary} />
      </ScrollView>
      <SummaryActions summary={summary} providerConfigured={providerConfigured} />
    </Screen>
  );
}
