import { PERMISSIONS, type UnassignedTicketSummary } from '@ashniva/types';
import { Badge, EmptyState, PageHeader, Table } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { usePermission } from '../../auth/session-context';
import { useSupportQueueQuery } from '../routing-api';

import '../../dashboard/dashboard.css';
import '../support-routing.css';

/**
 * Everything nobody is working on.
 *
 * This screen is what makes "a ticket is never dropped" true rather than merely intended. A
 * ticket the router could not place — everybody on leave, nobody configured, a type that goes to
 * the queue by policy — has to land somewhere a person actually looks, and the reason has to be
 * on it so that looking is useful.
 */
export function SupportQueuePage() {
  const canManage = usePermission(PERMISSIONS.SUPPORT_ROUTING_MANAGE);
  const queue = useSupportQueueQuery(canManage);
  const navigate = useNavigate();

  if (!canManage) {
    return (
      <div className="dashboard">
        <PageHeader title="Support queue" />
        <EmptyState
          title="Not available"
          description="The support queue needs the support-routing permission."
        />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <PageHeader
        title="Support queue"
        subtitle="Open tickets with nobody on them, and why the router left each one here."
      />
      <QueryState
        isLoading={queue.isLoading}
        isError={queue.isError}
        error={queue.error}
        onRetry={() => void queue.refetch()}
      >
        <Table<UnassignedTicketSummary>
          aria-label="Unassigned tickets"
          rowKey={(row) => row.id}
          rows={queue.data ?? []}
          onRowClick={(row) => navigate(`/tickets/${row.id}`)}
          empty={
            <EmptyState
              title="Nothing waiting"
              description="Every open ticket has somebody on it."
            />
          }
          columns={[
            { key: 'key', header: 'Ticket', width: '110px', render: (row) => row.key },
            { key: 'title', header: 'Title', render: (row) => row.title },
            {
              key: 'client',
              header: 'Client',
              hideOnMobile: true,
              render: (row) => row.clientOrganizationName,
            },
            {
              key: 'project',
              header: 'Project',
              hideOnMobile: true,
              render: (row) => row.project?.code ?? '—',
            },
            {
              key: 'module',
              header: 'Area',
              hideOnMobile: true,
              render: (row) => row.module ?? '—',
            },
            {
              key: 'priority',
              header: 'Priority',
              width: '100px',
              render: (row) => <Badge tone="neutral">{row.priority}</Badge>,
            },
            {
              key: 'reason',
              header: 'Why it is here',
              render: (row) => <span className="muted">{row.queueReason ?? 'Never routed'}</span>,
            },
          ]}
        />
      </QueryState>
    </div>
  );
}
