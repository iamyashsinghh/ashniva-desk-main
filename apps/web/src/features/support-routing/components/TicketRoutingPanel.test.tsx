import { ROLE_KEYS, type TicketDetail, type TicketRoutingDetail } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { TicketRoutingPanel } from './TicketRoutingPanel';

/**
 * The routing panel, and the line it draws.
 *
 * A developer may see that their ticket was routed to them. They may not see who else was
 * considered or that a colleague is on leave — the API returns an empty trail for them, and this
 * proves the panel does not invent one or leave a heading over nothing.
 */

const DEV = 'user-dev';

function ticketFixture(): TicketDetail {
  return {
    id: 'ticket-1',
    key: 'T-1',
    number: 1,
    title: 'WhatsApp template sync failing',
    description: 'Templates stopped syncing.',
    type: 'BUG',
    priority: 'HIGH',
    status: 'AUTO_ASSIGNED',
    source: 'PORTAL',
    module: 'API',
    impact: null,
    project: { id: 'project-1', code: 'ACM', name: 'Acme portal' },
    clientOrganization: { id: 'client-1', name: 'Acme', slug: 'acme' },
    requester: { id: 'user-client', name: 'Sunita M', email: 'sunita@example.com' },
    assignedTo: { id: DEV, name: 'Arjun R', email: 'arjun@example.com' },
    team: null,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-09-07T04:00:00.000Z',
    updatedAt: '2026-09-07T04:00:00.000Z',
    linkedTaskCount: 0,
    sla: null,
    statusHistory: [],
    comments: [],
    linkedTasks: [],
    files: [],
    actions: [],
  } as unknown as TicketDetail;
}

function routingFixture(over: Partial<TicketRoutingDetail> = {}): TicketRoutingDetail {
  return {
    state: {
      ticketId: 'ticket-1',
      outcome: 'AUTO_ASSIGNED',
      assignmentType: 'AUTOMATIC',
      attempt: 1,
      policyVersion: 1,
      routedAt: '2026-09-07T04:00:00.000Z',
      acknowledgeDueAt: '2026-09-07T04:15:00.000Z',
      acknowledgedAt: null,
      acknowledgedBy: null,
      escalationDueAt: '2026-09-07T04:45:00.000Z',
      escalationLevel: 0,
      manualOverrideBy: null,
      manualOverrideAt: null,
      manualOverrideReason: null,
      queueReason: null,
    },
    trail: [],
    ...over,
  };
}

function renderPanel(roleKey: string, detail: TicketRoutingDetail, userId = DEV) {
  setAuthenticated('test-token', { ...sessionUserFor(roleKey as never), id: userId });
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve({ ok: true, status: 200, json: async () => detail } as Response),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TicketRoutingPanel ticket={ticketFixture()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TicketRoutingPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers the assignee the acknowledgement they owe', async () => {
    renderPanel(ROLE_KEYS.DEVELOPER, routingFixture());
    expect(await screen.findByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
  });

  it('does not show a developer the candidates that were passed over', async () => {
    renderPanel(ROLE_KEYS.DEVELOPER, routingFixture());
    await screen.findByRole('button', { name: 'Acknowledge' });
    // No heading over an empty list, and no re-routing controls they could not use anyway.
    expect(screen.queryByText('Candidates considered')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run the router' })).not.toBeInTheDocument();
  });

  it('shows a manager the trail with each skip reason spelled out', async () => {
    renderPanel(
      ROLE_KEYS.PROJECT_MANAGER,
      routingFixture({
        trail: [
          {
            id: 'trail-1',
            attempt: 1,
            position: 1,
            user: { id: 'user-other', name: 'Priya S', email: 'priya@example.com' },
            role: 'MODULE_OWNER',
            accepted: false,
            skipReason: 'ON_LEAVE',
            detail: 'Module owner: On leave',
            policyVersion: 1,
            createdAt: '2026-09-07T04:00:00.000Z',
          },
        ],
      }),
      'user-manager',
    );
    expect(await screen.findByText('Candidates considered')).toBeInTheDocument();
    expect(screen.getByText('On leave')).toBeInTheDocument();
    expect(screen.getByText('Priya S')).toBeInTheDocument();
  });

  it('says why a ticket is waiting rather than showing an empty panel', async () => {
    renderPanel(
      ROLE_KEYS.PROJECT_MANAGER,
      routingFixture({
        state: {
          ...routingFixture().state!,
          outcome: 'SUPPORT_QUEUE',
          queueReason: 'Every candidate in the chain was unavailable',
        },
      }),
      'user-manager',
    );
    expect(
      await screen.findByText('Every candidate in the chain was unavailable'),
    ).toBeInTheDocument();
  });
});
