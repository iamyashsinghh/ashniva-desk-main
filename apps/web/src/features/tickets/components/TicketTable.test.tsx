import { TICKET_STATUS, TICKET_TYPE, type TicketSummary } from '@ashniva/types';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { TicketTable } from './TicketTable';

/**
 * The ticket list's two design-system promises.
 *
 * A list that vanishes and comes back moves every row below it twice, and the ticket desk
 * refetches on every one of its nine view chips. And "Unassigned" was colour-only nowhere, but the
 * assignee cell now carries an avatar, which must not become the only way to tell who owns a
 * ticket.
 */
function ticket(over: Partial<TicketSummary> = {}): TicketSummary {
  return {
    id: 'ticket-1',
    key: 'ACM-T-14',
    number: 14,
    title: 'Invoices export fails',
    type: TICKET_TYPE.SUPPORT,
    status: TICKET_STATUS.NEW,
    priority: 'HIGH',
    clientOrganization: { id: 'org-acme', name: 'Acme Retail Pvt Ltd', slug: 'acme' },
    project: null,
    assignedTo: null,
    updatedAt: '2026-09-01T09:00:00.000Z',
    createdAt: '2026-09-01T08:00:00.000Z',
    sla: null,
    ...over,
  } as TicketSummary;
}

function show(props: Parameters<typeof TicketTable>[0]) {
  return render(
    <MemoryRouter>
      <TicketTable {...props} />
    </MemoryRouter>,
  );
}

describe('TicketTable', () => {
  it('holds the table in place while it reloads, and says it is busy', () => {
    show({ tickets: [], loading: true });

    const table = screen.getByRole('table', { name: 'Tickets' });
    expect(table).toHaveAttribute('aria-busy', 'true');
    // Placeholder rows, not the empty state: the list is loading, not empty.
    expect(screen.queryByText('No tickets')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });

  it('shows the empty state only once it is not loading', () => {
    show({ tickets: [], emptyTitle: 'No tickets match' });
    expect(screen.getByText('No tickets match')).toBeInTheDocument();
  });

  it('names the assignee in text beside their avatar, not by the avatar alone', () => {
    show({
      tickets: [ticket({ assignedTo: { id: 'user-a', name: 'Priya Raman', email: 'p@x.io' } })],
    });

    expect(screen.getByText('Priya Raman')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Priya Raman' })).toBeInTheDocument();
  });

  it('says "Unassigned" in words', () => {
    show({ tickets: [ticket()] });
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });
});
