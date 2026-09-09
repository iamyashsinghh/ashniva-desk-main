import {
  AI_SUMMARY_STATUS,
  AI_SUMMARY_TYPE_LABELS,
  PERMISSIONS,
  type AiSummaryListRow,
  type AiSummaryStatus,
} from '@ashniva/types';
import {
  Button,
  EmptyState,
  PageHeader,
  SegmentedControl,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { AiSummaryStatusPill } from '../../../shared/components/StatusPills';
import { formatDate, formatRelative } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useAiProviderStatusQuery, useAiSummariesQuery } from '../api';
import { GenerateSummaryModal } from '../components/GenerateSummaryModal';

import '../ai-summaries.css';

type View = 'open' | 'review' | 'published' | 'all';

const VIEWS: Record<View, { label: string; statuses?: AiSummaryStatus[] }> = {
  open: {
    label: 'In progress',
    statuses: [
      AI_SUMMARY_STATUS.DRAFT,
      AI_SUMMARY_STATUS.GENERATING,
      AI_SUMMARY_STATUS.GENERATION_FAILED,
      AI_SUMMARY_STATUS.CHANGES_REQUESTED,
    ],
  },
  review: {
    label: 'Waiting on review',
    statuses: [AI_SUMMARY_STATUS.IN_REVIEW, AI_SUMMARY_STATUS.APPROVED],
  },
  published: { label: 'Published', statuses: [AI_SUMMARY_STATUS.PUBLISHED] },
  all: { label: 'All' },
};

/** The list of generated summaries, grouped by where each one has reached in review. */
export function AiSummariesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [generating, setGenerating] = useState(false);
  const canGenerate = usePermission(PERMISSIONS.AI_SUMMARY_GENERATE);
  const view = (params.get('view') ?? 'open') as View;
  const query = useAiSummariesQuery({ status: VIEWS[view]?.statuses });
  const provider = useAiProviderStatusQuery();

  const columns: TableColumn<AiSummaryListRow>[] = [
    {
      key: 'title',
      header: 'Summary',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">
            {row.projectCode ?? row.subjectUserName ?? AI_SUMMARY_TYPE_LABELS[row.type]}
          </span>
          <span className="task-cell__title">{row.title}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      hideOnMobile: true,
      width: '180px',
      render: (row) => AI_SUMMARY_TYPE_LABELS[row.type],
    },
    {
      key: 'period',
      header: 'Period',
      hideOnMobile: true,
      width: '190px',
      render: (row) => `${formatDate(row.periodStart)} – ${formatDate(row.periodEnd)}`,
    },
    {
      key: 'sources',
      header: 'Sources',
      hideOnMobile: true,
      width: '90px',
      render: (row) => row.sourceCount,
    },
    {
      key: 'updated',
      header: 'Updated',
      hideOnMobile: true,
      width: '110px',
      render: (row) => <span className="muted">{formatRelative(row.updatedAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '160px',
      render: (row) => <AiSummaryStatusPill status={row.status} />,
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Progress summaries"
        subtitle={query.data ? `${query.data.total} in this view` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate('/ai-summaries/usage')}>
              Usage
            </Button>
            {canGenerate ? (
              <Button
                variant="primary"
                onClick={() => setGenerating(true)}
                disabled={provider.data ? !provider.data.configured : false}
                // Connecting a provider goes through the integrations API, which has no screen
                // yet. Naming one would send the reader somewhere that does not exist.
                disabledReason="No AI provider is configured for this organization."
              >
                New summary
              </Button>
            ) : null}
          </>
        }
      >
        <SegmentedControl
          aria-label="View"
          size="sm"
          value={view}
          onChange={(next) => setParams({ view: next }, { replace: true })}
          options={(Object.keys(VIEWS) as View[]).map((key) => ({ key, label: VIEWS[key].label }))}
        />
      </PageHeader>

      {provider.data && !provider.data.configured ? (
        <p className="ai-warning">
          No AI provider is configured for this organization, so nothing can be generated yet. An
          administrator connects one through the integrations API; there is no screen for it yet.
        </p>
      ) : null}

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <Table
            aria-label="Progress summaries"
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/ai-summaries/${row.id}`)}
            empty={
              <EmptyState
                title="No summaries"
                description="Generate a summary of a period from tasks, tickets and updates. Everything generated is a draft until someone approves it."
              />
            }
          />
        ) : null}
      </QueryState>

      {generating ? <GenerateSummaryModal onClose={() => setGenerating(false)} /> : null}
    </div>
  );
}
