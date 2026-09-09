import {
  PERMISSIONS,
  RELEASE_NOTE_STATUS,
  type ReleaseNoteStatus,
  type ReleaseNoteSummary,
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
import { ReleaseNoteStatusPill } from '../../../shared/components/StatusPills';
import { formatDate, formatRelative } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useReleaseNotesQuery } from '../api';
import { ReleaseNoteFormModal } from '../components/ReleaseNoteFormModal';

type View = 'open' | 'review' | 'published' | 'all';

const VIEWS: Record<View, { label: string; statuses?: ReleaseNoteStatus[] }> = {
  open: {
    label: 'In progress',
    statuses: [
      RELEASE_NOTE_STATUS.DRAFT,
      RELEASE_NOTE_STATUS.IN_REVIEW,
      RELEASE_NOTE_STATUS.CHANGES_REQUESTED,
      RELEASE_NOTE_STATUS.APPROVED,
    ],
  },
  review: { label: 'Waiting on review', statuses: [RELEASE_NOTE_STATUS.IN_REVIEW] },
  published: { label: 'Published', statuses: [RELEASE_NOTE_STATUS.PUBLISHED] },
  all: { label: 'All' },
};

/** Internal release-note list, grouped by where each note has reached in the workflow. */
export function ReleaseNotesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const canWrite = usePermission(PERMISSIONS.RELEASE_NOTE_WRITE);
  const view = (params.get('view') ?? 'open') as View;
  const query = useReleaseNotesQuery({ status: VIEWS[view]?.statuses });

  const columns: TableColumn<ReleaseNoteSummary>[] = [
    {
      key: 'version',
      header: 'Release',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">{row.projectCode}</span>
          <span className="task-cell__title">{row.version}</span>
        </div>
      ),
    },
    {
      key: 'releaseDate',
      header: 'Release date',
      hideOnMobile: true,
      width: '130px',
      render: (row) => formatDate(row.releaseDate),
    },
    {
      key: 'items',
      header: 'Items',
      hideOnMobile: true,
      width: '80px',
      render: (row) => row.itemCount,
    },
    {
      key: 'published',
      header: 'Published',
      hideOnMobile: true,
      width: '130px',
      render: (row) =>
        row.publishedAt ? formatRelative(row.publishedAt) : <span className="muted">—</span>,
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
      width: '150px',
      render: (row) => <ReleaseNoteStatusPill status={row.status} />,
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Release notes"
        subtitle={query.data ? `${query.data.total} in this view` : undefined}
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New release note
            </Button>
          ) : undefined
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

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <Table
            aria-label="Release notes"
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/release-notes/${row.id}`)}
            empty={
              <EmptyState
                title="No release notes"
                description="Draft a release note to summarise what a client received in a release."
              />
            }
          />
        ) : null}
      </QueryState>

      {creating ? (
        <ReleaseNoteFormModal
          onClose={() => setCreating(false)}
          onSaved={(id) => void navigate(`/release-notes/${id}`)}
        />
      ) : null}
    </div>
  );
}
