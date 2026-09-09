import type { PortalTicketSummary } from '@ashniva/types';
import { EmptyState, Table, type TableColumn } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { ClientStatusPill } from '../../../shared/components/StatusPills';
import { formatRelative } from '../../../shared/lib/format';

interface PortalTicketRowsProps {
  tickets: PortalTicketSummary[];
  /** Placeholder rows instead of a spinner, so the page holds still while the view changes. */
  loading?: boolean;
}

/** Client-facing ticket rows: client-visible status only, no assignee or internal data. */
export function PortalTicketRows({ tickets, loading = false }: PortalTicketRowsProps) {
  const navigate = useNavigate();
  const columns: TableColumn<PortalTicketSummary>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      render: (ticket) => (
        <div className="task-cell">
          <span className="task-cell__key">{ticket.key}</span>
          <span className="task-cell__title">{ticket.title}</span>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      hideOnMobile: true,
      width: '160px',
      render: (ticket) => ticket.project?.name ?? '—',
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '90px',
      render: (ticket) => <span className="muted">{formatRelative(ticket.updatedAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '170px',
      render: (ticket) => <ClientStatusPill status={ticket.status} />,
    },
  ];
  return (
    <Table
      aria-label="Tickets"
      columns={columns}
      rows={tickets}
      rowKey={(ticket) => ticket.id}
      onRowClick={(ticket) => void navigate(`/portal/tickets/${ticket.id}`)}
      loading={loading}
      empty={<EmptyState title="No open tickets" />}
    />
  );
}
