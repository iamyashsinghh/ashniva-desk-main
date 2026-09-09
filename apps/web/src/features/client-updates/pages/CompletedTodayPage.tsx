import { PERMISSIONS, type ClientUpdateSummary } from '@ashniva/types';
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader, Select } from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDate, formatLongDate, todayIso } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useOrganizationsQuery } from '../../users/api';
import { useClientUpdateMutations, useClientUpdatesQuery } from '../api';
import { EditWordingModal } from '../components/EditWordingModal';
import { UpdateRow } from '../components/UpdateRow';

import '../../dashboard/dashboard.css';

/**
 * Completed Today: the publish queue on the left (client-visible completions waiting for a
 * senior), what each client sees on the right. Publishing is an explicit, audited action.
 */
export function CompletedTodayPage() {
  const canPublish = usePermission(PERMISSIONS.CLIENT_UPDATE_PUBLISH);
  const [date, setDate] = useState(todayIso());
  const [clientId, setClientId] = useState('');
  const [editing, setEditing] = useState<ClientUpdateSummary | null>(null);
  const [error, setError] = useState<string | undefined>();
  const organizations = useOrganizationsQuery();
  const pending = useClientUpdatesQuery({
    status: 'PENDING',
    clientOrganizationId: clientId || undefined,
  });
  const published = useClientUpdatesQuery({
    status: 'PUBLISHED',
    date,
    clientOrganizationId: clientId || undefined,
  });
  const { publish, withdraw } = useClientUpdateMutations();

  async function publishAll() {
    setError(undefined);
    try {
      for (const update of pending.data ?? []) {
        await publish.mutateAsync(update.id);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const queue = pending.data ?? [];
  return (
    <div className="dashboard">
      <PageHeader
        title="Completed today"
        subtitle={`${formatLongDate(new Date(`${date}T00:00:00`))} · publish queue on the left, what the client sees on the right`}
        actions={
          <Button
            variant="primary"
            loading={publish.isPending}
            disabled={!canPublish || queue.length === 0}
            disabledReason={
              canPublish ? 'Nothing to publish' : 'Only seniors, managers or admins publish'
            }
            onClick={() => void publishAll()}
          >
            Publish {queue.length} approved
          </Button>
        }
      >
        <Input
          type="date"
          aria-label="Date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <Select
          aria-label="Client"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          options={[
            { value: '', label: 'All clients' },
            ...(organizations.data ?? [])
              .filter((organization) => !organization.isServiceProvider)
              .map((organization) => ({ value: organization.id, label: organization.name })),
          ]}
        />
      </PageHeader>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="dashboard__grid dashboard__grid--equal">
        <Card
          title="Client-visible · ready to publish"
          headerAddon={<Badge tone="success">Client</Badge>}
        >
          <QueryState isLoading={pending.isLoading} isError={pending.isError} error={pending.error}>
            {queue.length === 0 ? (
              <EmptyState
                title="Nothing waiting to publish"
                description="Approved client-visible tasks appear here."
              />
            ) : (
              <div className="update-list">
                {queue.map((update) => (
                  <UpdateRow key={update.id} update={update}>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!canPublish}
                      disabledReason="Only seniors, managers or admins publish"
                      loading={publish.isPending}
                      onClick={() =>
                        void publish
                          .mutateAsync(update.id)
                          .catch((cause) => setError(errorMessage(cause)))
                      }
                    >
                      Publish
                    </Button>
                    <Button
                      size="sm"
                      disabled={!canPublish}
                      disabledReason="Only seniors, managers or admins edit the wording"
                      onClick={() => setEditing(update)}
                    >
                      Edit wording
                    </Button>
                  </UpdateRow>
                ))}
              </div>
            )}
          </QueryState>
        </Card>
        <Card
          title={`What ${clientId ? (organizations.data?.find((organization) => organization.id === clientId)?.name ?? 'the client') : 'clients'} see`}
          headerAddon={<span className="muted">{formatDate(date)}</span>}
        >
          <QueryState
            isLoading={published.isLoading}
            isError={published.isError}
            error={published.error}
          >
            {(published.data ?? []).length === 0 ? (
              <EmptyState title="Nothing published for this day" />
            ) : (
              <div className="update-list">
                {(published.data ?? []).map((update) => (
                  <UpdateRow key={update.id} update={update} published>
                    {canPublish ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={withdraw.isPending}
                        onClick={() =>
                          void withdraw
                            .mutateAsync(update.id)
                            .catch((cause) => setError(errorMessage(cause)))
                        }
                      >
                        Withdraw
                      </Button>
                    ) : null}
                  </UpdateRow>
                ))}
              </div>
            )}
          </QueryState>
        </Card>
      </div>
      {editing ? <EditWordingModal update={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
