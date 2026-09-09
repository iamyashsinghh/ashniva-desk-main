import { ROLE_KEYS, type TicketRelationView, type TicketRelationsResponse } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { TicketRelationsPanel } from './TicketRelationsPanel';

/**
 * The panel renders the server's answer and never fills a gap in it.
 *
 * The filtering that matters — whose ticket a reader may learn about — is the API's, and the one
 * thing this component must not do is turn a redacted link into a guess. So the interesting case
 * here is `other: null`: a link the reader may not follow shows that it exists and nothing else,
 * with no id anywhere in the markup for a curious person to read out of the DOM.
 */
function relationFixture(over: Partial<TicketRelationView> = {}): TicketRelationView {
  return {
    id: 'rel-1',
    type: 'DUPLICATE_OF',
    role: 'DUPLICATE',
    note: null,
    linkedBy: { id: 'u1', name: 'Neha P', email: 'neha@example.com' },
    linkedAt: '2026-09-01T10:00:00.000Z',
    other: {
      id: 'ticket-45',
      key: 'T-45',
      title: 'Invoice printing fails',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      clientOrganization: { id: 'client-1', name: 'Acme', slug: 'acme' },
      assignedTo: null,
    },
    ...over,
  };
}

function relationsFixture(over: Partial<TicketRelationsResponse> = {}): TicketRelationsResponse {
  return { relations: [relationFixture()], canLink: true, ...over };
}

function renderPanel(data: TicketRelationsResponse, roleKey: string = ROLE_KEYS.SUPPORT_EXECUTIVE) {
  setAuthenticated('test-token', { ...sessionUserFor(roleKey as never), id: 'user-viewer' });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => data,
  } as Response);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TicketRelationsPanel ticketId="ticket-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TicketRelationsPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says which way round a duplicate points', async () => {
    renderPanel(relationsFixture());
    expect(await screen.findByText('Duplicate of')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'T-45' })).toBeInTheDocument();
  });

  it('reads the same row as "duplicated by" from the ticket being kept', async () => {
    renderPanel(relationsFixture({ relations: [relationFixture({ role: 'CANONICAL' })] }));
    expect(await screen.findByText('Duplicated by')).toBeInTheDocument();
  });

  it('shows a redacted link with no id and no title', async () => {
    const { container } = renderPanel(
      relationsFixture({ relations: [relationFixture({ other: null })] }),
    );
    expect(await screen.findByText('A ticket you do not have access to')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('ticket-45');
    expect(container.innerHTML).not.toContain('T-45');
  });

  it('offers no link or unlink control to a reader who may not write', async () => {
    renderPanel(relationsFixture({ canLink: false }));
    expect(await screen.findByRole('link', { name: 'T-45' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link a ticket' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlink' })).not.toBeInTheDocument();
  });

  it('renders nothing at all when there is neither a link nor anything to do', () => {
    const { container } = renderPanel({ relations: [], canLink: false });
    expect(container.textContent).toBe('');
  });
});
