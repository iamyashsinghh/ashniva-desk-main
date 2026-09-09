import { AI_SUMMARY_TYPE_LABELS } from '@ashniva/types';
import { Card, EmptyState, PageHeader } from '@ashniva/ui';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate, formatDateTime } from '../../../shared/lib/format';
import { usePortalAiSummariesQuery } from '../api';

import '../ai-summaries.css';

/**
 * Progress summaries as a client reads them.
 *
 * Everything listed here has been approved and published by a person. The API returns a different
 * type from the internal one, with no internal text, no sources and no review trail — so there is
 * nothing on this page that could accidentally render one.
 */
export function PortalAiSummariesPage() {
  const query = usePortalAiSummariesQuery();
  const items = query.data?.items ?? [];

  return (
    <div className="ai-page">
      <PageHeader
        title="Progress summaries"
        subtitle="What has been happening on your work, period by period"
      />

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {items.length === 0 ? (
          <EmptyState
            title="No summaries yet"
            description="Summaries appear here once your team has published one."
          />
        ) : (
          items.map((summary) => (
            <Card key={summary.id} title={summary.title}>
              <p className="muted">
                {AI_SUMMARY_TYPE_LABELS[summary.type]} · {formatDate(summary.periodStart)} –{' '}
                {formatDate(summary.periodEnd)}
              </p>
              <p className="ai-text">{summary.content}</p>
              <p className="muted">Published {formatDateTime(summary.publishedAt)}</p>
            </Card>
          ))
        )}
      </QueryState>
    </div>
  );
}
