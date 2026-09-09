import { PERMISSIONS, type TestAccountSummary } from '@ashniva/types';
import { Button, Card, EmptyState, PageHeader } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useProjectQuery } from '../../projects/api';
import { useCredentialAccessLog, useTestAccounts, useTestEnvironments } from '../api';
import { GrantAccessModal } from '../components/GrantAccessModal';
import { TestAccountPanel } from '../components/TestAccountPanel';
import { TestAccountsTable } from '../components/TestAccountsTable';

import '../../dashboard/dashboard.css';
import '../qa.css';

/**
 * Test logins for one project (design map 2n).
 *
 * The screen shows three things that belong together: which logins exist, who may currently read
 * one, and who has read one. The password itself appears in exactly one place — the timed reveal
 * inside the grant dialog — and never in this list.
 */
export function TestAccountsPage() {
  const { id } = useParams<{ id: string }>();
  const project = useProjectQuery(id);
  const accounts = useTestAccounts(id);
  const environments = useTestEnvironments(id);
  const canManage = usePermission(PERMISSIONS.TEST_ACCOUNT_MANAGE);
  const accessLog = useCredentialAccessLog(id, canManage);
  const [editing, setEditing] = useState<TestAccountSummary | null>(null);
  const [granting, setGranting] = useState<TestAccountSummary | null>(null);
  const [adding, setAdding] = useState(false);

  const addButton = (
    <Button
      variant="primary"
      disabled={!canManage}
      disabledReason="Recording a test login needs the test-account:manage permission"
      onClick={() => setAdding(true)}
    >
      New test login
    </Button>
  );

  return (
    <div className="list-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/projects">Projects</Link> /{' '}
            <Link to={`/projects/${id}`}>{project.data?.name ?? 'Project'}</Link>
          </>
        }
        title="Test accounts"
        subtitle="Shared test logins, who may read one and who has"
        actions={addButton}
      >
        <Link to={`/projects/${id}/environments`}>Test environments for this project</Link>
      </PageHeader>

      <QueryState
        isLoading={accounts.isLoading}
        isError={accounts.isError}
        error={accounts.error}
        onRetry={() => void accounts.refetch()}
      >
        {accounts.data && id ? (
          <TestAccountsTable
            accounts={accounts.data}
            projectId={id}
            canManage={canManage}
            onEdit={setEditing}
            onGrant={setGranting}
            emptyAction={canManage ? addButton : undefined}
          />
        ) : null}
      </QueryState>

      {canManage ? (
        <Card title="Who has read a password">
          <QueryState
            isLoading={accessLog.isLoading}
            isError={accessLog.isError}
            error={accessLog.error}
            onRetry={() => void accessLog.refetch()}
          >
            {accessLog.data && accessLog.data.items.length > 0 ? (
              <ul className="update-list">
                {accessLog.data.items.map((row) => (
                  <li key={row.id} className="update-list__item">
                    <span>
                      {row.userName} · {row.action.toLowerCase()} · {row.testAccountLabel}
                    </span>
                    <span className="update-list__meta">
                      {formatDateTime(row.revealedAt)}
                      {row.ipAddress ? ` · ${row.ipAddress}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Nothing read yet"
                description="Every reveal, rotation and new login lands here."
              />
            )}
          </QueryState>
        </Card>
      ) : null}

      {adding && id ? (
        <TestAccountPanel
          projectId={id}
          environments={environments.data ?? []}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {editing && id ? (
        <TestAccountPanel
          projectId={id}
          environments={environments.data ?? []}
          existing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {granting ? <GrantAccessModal account={granting} onClose={() => setGranting(null)} /> : null}
    </div>
  );
}
