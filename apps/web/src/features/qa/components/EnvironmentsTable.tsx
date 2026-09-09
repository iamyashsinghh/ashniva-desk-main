import type { TestEnvironmentRow } from '@ashniva/types';
import { Button, EmptyState, StatusPill, Table, type TableColumn } from '@ashniva/ui';
import type { ReactNode } from 'react';

import { formatDateTime } from '../../../shared/lib/format';
import {
  ENVIRONMENT_LABELS,
  ENVIRONMENT_STATUS_LABELS,
  ENVIRONMENT_STATUS_TONES,
} from '../qa-labels';

interface EnvironmentsTableProps {
  environments: TestEnvironmentRow[];
  canManage: boolean;
  onEdit: (environment: TestEnvironmentRow) => void;
  /** Rendered inside the empty state, so an empty screen still offers the one useful action. */
  emptyAction?: ReactNode;
}

/** Where a project is deployed, what is on it and whether it is up. */
export function EnvironmentsTable({
  environments,
  canManage,
  onEdit,
  emptyAction,
}: EnvironmentsTableProps) {
  const columns: TableColumn<TestEnvironmentRow>[] = [
    {
      key: 'kind',
      header: 'Environment',
      width: '140px',
      render: (row) => ENVIRONMENT_LABELS[row.kind],
    },
    {
      key: 'url',
      header: 'URL',
      render: (row) => (
        <a href={row.url} target="_blank" rel="noreferrer noopener">
          {row.url}
        </a>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (row) => (
        <StatusPill
          tone={ENVIRONMENT_STATUS_TONES[row.status]}
          label={ENVIRONMENT_STATUS_LABELS[row.status]}
        />
      ),
    },
    {
      key: 'deployed',
      header: 'Deployed',
      hideOnMobile: true,
      render: (row) => (
        <span className="muted">
          {row.deployedVersion ?? '—'}
          {row.deployedAt ? ` · ${formatDateTime(row.deployedAt)}` : ''}
        </span>
      ),
    },
    {
      key: 'github',
      header: 'GitHub',
      hideOnMobile: true,
      width: '140px',
      render: (row) => <span className="muted">{row.githubEnvironmentName ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '90px',
      align: 'right',
      render: (row) => (
        <Button
          size="sm"
          disabled={!canManage}
          disabledReason="Editing an environment needs the test-account:manage permission"
          onClick={() => onEdit(row)}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Table
      aria-label="Test environments"
      columns={columns}
      rows={environments}
      rowKey={(row) => row.id}
      empty={
        <EmptyState
          title="No environments recorded"
          description="Testers have nowhere to go until staging or production is written down here."
          action={emptyAction}
        />
      }
    />
  );
}
