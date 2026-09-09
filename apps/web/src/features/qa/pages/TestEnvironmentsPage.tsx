import { PERMISSIONS, type TestEnvironmentRow } from '@ashniva/types';
import { Button, PageHeader } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { usePermission } from '../../auth/session-context';
import { useProjectQuery } from '../../projects/api';
import { useTestEnvironments } from '../api';
import { EnvironmentForm } from '../components/EnvironmentForm';
import { EnvironmentsTable } from '../components/EnvironmentsTable';

import '../../dashboard/dashboard.css';
import '../qa.css';

/**
 * Test environments for one project (design map 2m).
 *
 * Reading the list is part of reading the project; recording one is part of looking after the test
 * estate, which the API gates with `test-account:manage`. Both are enforced there — the buttons
 * here only say so in advance.
 */
export function TestEnvironmentsPage() {
  const { id } = useParams<{ id: string }>();
  const project = useProjectQuery(id);
  const environments = useTestEnvironments(id);
  const canManage = usePermission(PERMISSIONS.TEST_ACCOUNT_MANAGE);
  const [editing, setEditing] = useState<TestEnvironmentRow | null>(null);
  const [adding, setAdding] = useState(false);

  const addButton = (
    <Button
      variant="primary"
      disabled={!canManage}
      disabledReason="Adding an environment needs the test-account:manage permission"
      onClick={() => setAdding(true)}
    >
      Add an environment
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
        title="Test environments"
        subtitle="Where this project is deployed, what is on it and whether it is up"
        actions={addButton}
      >
        <Link to={`/projects/${id}/test-accounts`}>Test logins for this project</Link>
      </PageHeader>

      <QueryState
        isLoading={environments.isLoading}
        isError={environments.isError}
        error={environments.error}
        onRetry={() => void environments.refetch()}
      >
        {environments.data ? (
          <EnvironmentsTable
            environments={environments.data}
            canManage={canManage}
            onEdit={setEditing}
            emptyAction={canManage ? addButton : undefined}
          />
        ) : null}
      </QueryState>

      {adding && id ? <EnvironmentForm projectId={id} onClose={() => setAdding(false)} /> : null}
      {editing && id ? (
        <EnvironmentForm projectId={id} existing={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
