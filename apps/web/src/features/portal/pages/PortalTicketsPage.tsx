import { TICKET_LIST_VIEW, type TicketListView } from '@ashniva/types';
import { Button, PageHeader, SegmentedControl } from '@ashniva/ui';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { usePortalTicketsQuery } from '../api';
import { PortalTicketRows } from '../components/PortalTicketRows';

/** Views a client can switch between; internal-only views (new, critical) are not offered. */
const PORTAL_VIEWS: { key: TicketListView; label: string }[] = [
  { key: TICKET_LIST_VIEW.OPEN, label: 'Open' },
  { key: TICKET_LIST_VIEW.WAITING, label: 'Waiting for you' },
  { key: TICKET_LIST_VIEW.MINE, label: 'Raised by me' },
  { key: TICKET_LIST_VIEW.RESOLVED, label: 'Resolved' },
  { key: TICKET_LIST_VIEW.ALL, label: 'All' },
];

/** Client ticket list: your organization's tickets with client-visible status only. */
export function PortalTicketsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('view');
  const view = PORTAL_VIEWS.find((entry) => entry.key === requested)?.key ?? TICKET_LIST_VIEW.OPEN;
  const tickets = usePortalTicketsQuery(view);

  return (
    <div className="list-page">
      <PageHeader
        title="Tickets"
        subtitle={tickets.data ? `${tickets.data.items.length} tickets` : undefined}
        actions={
          <Button variant="primary" onClick={() => void navigate('/portal/tickets/new')}>
            + Raise a ticket
          </Button>
        }
      >
        <SegmentedControl
          aria-label="View"
          size="sm"
          value={view}
          onChange={(next) => setParams({ view: next }, { replace: true })}
          options={PORTAL_VIEWS}
        />
      </PageHeader>
      <QueryState
        isLoading={tickets.isLoading}
        isError={tickets.isError}
        error={tickets.error}
        onRetry={() => void tickets.refetch()}
        loadingFallback={<PortalTicketRows tickets={[]} loading />}
      >
        {tickets.data ? <PortalTicketRows tickets={tickets.data.items} /> : null}
      </QueryState>
    </div>
  );
}
