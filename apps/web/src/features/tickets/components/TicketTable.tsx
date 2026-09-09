import { TICKET_TYPE_LABELS, type TicketSummary } from '@ashniva/types';
import { Avatar, EmptyState, PriorityDot, Table, type TableColumn } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { SlaStatusPill, TicketStatusPill } from '../../../shared/components/StatusPills';
import { formatRelative } from '../../../shared/lib/format';

interface TicketTableProps {
  tickets: TicketSummary[];
  emptyTitle?: string;
  emptyDescription?: string;
  showClient?: boolean;
  /** Placeholder rows instead of a spinner, so the page does not move while the list reloads. */
  loading?: boolean;
}

export function TicketTable({
  tickets,
  emptyTitle = 'No tickets',
  emptyDescription,
  showClient = true,
  loading = false,
}: TicketTableProps) {
  const navigate = useNavigate();
  const columns: TableColumn<TicketSummary>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      render: (ticket) => (
        <div className="task-cell">
          <span className="task-cell__key">
            <PriorityDot priority={ticket.priority} />
            {ticket.key}
          </span>
          <span className="task-cell__title">{ticket.title}</span>
        </div>
      ),
    },
    ...(showClient
      ? [
          {
            key: 'client',
            header: 'Company',
            hideOnMobile: true,
            width: '170px',
            render: (ticket: TicketSummary) => ticket.clientOrganization.name,
          },
        ]
      : []),
    {
      key: 'type',
      header: 'Type',
      hideOnMobile: true,
      width: '120px',
      render: (ticket) => TICKET_TYPE_LABELS[ticket.type],
    },
    {
      key: 'assignee',
      header: 'Assigned to',
      hideOnMobile: true,
      width: '170px',
      render: (ticket) =>
        ticket.assignedTo ? (
          <span className="task-cell__person">
            <Avatar name={ticket.assignedTo.name} size="sm" />
            {ticket.assignedTo.name}
          </span>
        ) : (
          <span className="muted">Unassigned</span>
        ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '90px',
      nowrap: true,
      render: (ticket) => <span className="muted">{formatRelative(ticket.updatedAt)}</span>,
    },
    {
      key: 'sla',
      header: 'SLA',
      hideOnMobile: true,
      width: '110px',
      render: (ticket) =>
        ticket.sla ? (
          <SlaStatusPill status={ticket.sla.overall} />
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '150px',
      render: (ticket) => <TicketStatusPill status={ticket.status} />,
    },
  ];
  return (
    <Table
      aria-label="Tickets"
      columns={columns}
      rows={tickets}
      rowKey={(ticket) => ticket.id}
      onRowClick={(ticket) => void navigate(`/tickets/${ticket.id}`)}
      loading={loading}
      empty={<EmptyState title={emptyTitle} description={emptyDescription} />}
    />
  );
}
