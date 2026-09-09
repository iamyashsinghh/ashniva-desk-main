import {
  PERMISSIONS,
  ROLE_KEYS,
  TICKET_LIST_VIEW,
  type TicketListView,
  type TicketStatus,
} from '@ashniva/types';
import { Button, Input, PageHeader, SegmentedControl, Select, Toolbar } from '@ashniva/ui';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { useCurrentUser, usePermission } from '../../auth/session-context';
import { useOrganizationsQuery } from '../../users/api';
import { useTicketsQuery } from '../api';
import { TicketTable } from '../components/TicketTable';

const VIEW_LABELS: Record<TicketListView, string> = {
  open: 'Open',
  new: 'New',
  mine: 'Mine',
  waiting: 'Waiting for client',
  critical: 'Critical',
  'sla-at-risk': 'SLA at risk',
  'sla-breached': 'SLA breached',
  resolved: 'Resolved',
  all: 'All',
};

/** Ticket desk: view chips, client filter, search. Employees only ever see their own tickets. */
export function TicketsPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const canRaise = usePermission(PERMISSIONS.TICKET_RAISE);
  const canTriage = usePermission(PERMISSIONS.TICKET_TRIAGE);
  const isEmployee = user.roleKey === ROLE_KEYS.INTERNAL_EMPLOYEE;

  const view = (params.get('view') ?? (isEmployee ? 'mine' : 'open')) as TicketListView;
  const status = params.get('status')?.split(',') as TicketStatus[] | undefined;
  const clientOrganizationId = params.get('clientOrganizationId') ?? '';
  // Carried by the operational dashboard's support cards, whose scope is one project.
  const projectId = params.get('projectId') ?? '';
  const resolvedToday = params.get('resolvedToday') === 'true';
  const search = params.get('search') ?? '';

  const tickets = useTicketsQuery({
    view,
    status,
    resolvedToday: resolvedToday || undefined,
    projectId: projectId || undefined,
    clientOrganizationId: clientOrganizationId || undefined,
    search: search || undefined,
  });
  const organizations = useOrganizationsQuery();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key === 'view') {
      next.delete('status');
    }
    setParams(next, { replace: true });
  };

  const views = Object.values(TICKET_LIST_VIEW).filter((entry) =>
    isEmployee ? entry === 'mine' || entry === 'resolved' : true,
  );

  return (
    <div className="list-page">
      <PageHeader
        title="Tickets"
        subtitle={tickets.data ? `${tickets.data.total} tickets` : undefined}
        actions={
          canRaise ? (
            <Button variant="primary" onClick={() => void navigate('/tickets/new')}>
              + Raise ticket
            </Button>
          ) : undefined
        }
      >
        <SegmentedControl
          aria-label="View"
          size="sm"
          value={view}
          onChange={(next) => setParam('view', next)}
          options={views.map((entry) => ({
            key: entry,
            label: entry === 'mine' && isEmployee ? 'My tickets' : VIEW_LABELS[entry],
          }))}
        />
        <Toolbar aria-label="Ticket filters">
          {canTriage ? (
            <Select
              aria-label="Company"
              value={clientOrganizationId}
              onChange={(event) => setParam('clientOrganizationId', event.target.value)}
              options={[
                { value: '', label: 'All companies' },
                ...(organizations.data ?? [])
                  .filter((organization) => !organization.isServiceProvider)
                  .map((organization) => ({ value: organization.id, label: organization.name })),
              ]}
            />
          ) : null}
          <Input
            type="search"
            aria-label="Search tickets"
            placeholder="Search number, title…"
            defaultValue={search}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setParam('search', (event.target as HTMLInputElement).value);
              }
            }}
          />
        </Toolbar>
      </PageHeader>
      <QueryState
        isLoading={tickets.isLoading}
        isError={tickets.isError}
        error={tickets.error}
        onRetry={() => void tickets.refetch()}
        /*
         * The table keeps its shape while it reloads. Every view chip and every filter above
         * refetches, and a spinner that replaces the table moves the whole page each time.
         */
        loadingFallback={<TicketTable tickets={[]} showClient={!isEmployee} loading />}
      >
        {tickets.data ? (
          <TicketTable
            tickets={tickets.data.items}
            showClient={!isEmployee}
            emptyTitle="No tickets match"
          />
        ) : null}
      </QueryState>
    </div>
  );
}
