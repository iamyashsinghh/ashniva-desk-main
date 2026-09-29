import { AI_SUMMARY_TYPE_LABELS, type PortalAiSummary } from '@ashniva/types';

import { useResource } from '../../../shared/api/queries';
import { ListRow, MetaLine } from '../../../shared/components/data-display';
import { Hero, Section } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { dateRange } from '../portal-display';
import { portalKeys } from '../portal-keys';
import { DetailFrame, RecordState } from '../PortalFrame';

/** One published progress summary, in full. */
export function PortalProgressSummaryScreen({
  summaryId,
  onOpenProject,
}: {
  summaryId: string;
  onOpenProject?: (projectId: string) => void;
}) {
  const query = useResource<PortalAiSummary>(
    portalKeys.summary(summaryId),
    `/portal/ai-summaries/${summaryId}`,
  );
  const summary = query.data;
  if (!summary) {
    return <RecordState query={query} loadingLabel="Loading the summary" />;
  }
  const projectId = summary.projectId;

  return (
    <DetailFrame refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <Hero
        overline={AI_SUMMARY_TYPE_LABELS[summary.type]}
        title={summary.title}
        icon="sparkles"
        iconTone="info"
      >
        <MetaLine icon="calendar-outline">
          {dateRange(summary.periodStart, summary.periodEnd)}
        </MetaLine>
        <MetaLine icon="time-outline">
          Published {formatDateTime(summary.publishedAt) ?? '—'}
        </MetaLine>
      </Hero>
      <Section title="Summary" icon="document-text-outline">
        <AppText>{summary.content}</AppText>
      </Section>
      {projectId && onOpenProject ? (
        <ListRow
          title="Open the project"
          subtitle="See the work this summary covers"
          icon="folder-open-outline"
          onPress={() => onOpenProject(projectId)}
          accessibilityHint="Opens the project"
        />
      ) : null}
    </DetailFrame>
  );
}
