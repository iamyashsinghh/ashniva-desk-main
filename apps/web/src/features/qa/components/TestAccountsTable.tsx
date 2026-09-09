import type { TestAccountSummary } from '@ashniva/types';
import { Badge, Button, EmptyState, Table, type TableColumn } from '@ashniva/ui';
import type { ReactNode } from 'react';

import { formatDateTime } from '../../../shared/lib/format';
import { ENVIRONMENT_LABELS, ROTATION_POLICY_LABELS } from '../qa-labels';
import { RotateButton } from './RotateButton';

interface TestAccountsTableProps {
  accounts: TestAccountSummary[];
  projectId: string;
  canManage: boolean;
  onEdit: (account: TestAccountSummary) => void;
  onGrant: (account: TestAccountSummary) => void;
  emptyAction?: ReactNode;
}

/** A project's reusable test logins. No column here can ever hold a password. */
export function TestAccountsTable({
  accounts,
  projectId,
  canManage,
  onEdit,
  onGrant,
  emptyAction,
}: TestAccountsTableProps) {
  const manageReason = 'Looking after test logins needs the test-account:manage permission';

  const columns: TableColumn<TestAccountSummary>[] = [
    {
      key: 'label',
      header: 'Login',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__title">{row.label}</span>
          <span className="task-cell__key">{row.username}</span>
        </div>
      ),
    },
    {
      key: 'environment',
      header: 'Environment',
      width: '130px',
      render: (row) => ENVIRONMENT_LABELS[row.environment],
    },
    {
      key: 'rotation',
      header: 'Password changes',
      hideOnMobile: true,
      render: (row) => (
        <span className="muted">
          {ROTATION_POLICY_LABELS[row.rotationPolicy]}
          {row.rotatedAt ? ` · last ${formatDateTime(row.rotatedAt)}` : ''}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      width: '150px',
      render: (row) => (
        <span className="chip-row">
          {row.isActive ? null : <Badge tone="warning">Retired</Badge>}
          {row.hasActiveGrant ? <Badge tone="success">You have access</Badge> : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '230px',
      align: 'right',
      render: (row) => (
        <span className="chip-row">
          <Button
            size="sm"
            disabled={!canManage}
            disabledReason={manageReason}
            onClick={() => onGrant(row)}
          >
            Grant
          </Button>
          <RotateButton account={row} projectId={projectId} canManage={canManage} />
          <Button
            size="sm"
            disabled={!canManage}
            disabledReason={manageReason}
            onClick={() => onEdit(row)}
          >
            Edit
          </Button>
        </span>
      ),
    },
  ];

  return (
    <Table
      aria-label="Test accounts"
      columns={columns}
      rows={accounts}
      rowKey={(row) => row.id}
      empty={
        <EmptyState
          title="No test logins yet"
          description="Record the shared logins testers use, so nobody passes one around in chat."
          action={emptyAction}
        />
      }
    />
  );
}
