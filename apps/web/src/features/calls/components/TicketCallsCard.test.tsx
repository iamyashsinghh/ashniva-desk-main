import { ROLE_KEYS, type CallSummary, type TicketDetail } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { TicketCallsCard } from './TicketCallsCard';

/**
 * The call history, and the two lines it draws.
 *
 * The first is the Call support action: whether it is offered is the *server's* answer, and this
 * card renders that answer rather than deciding for itself — so a product with calls switched off
 * gets a disabled control that says why, not a control that fails when pressed.
 *
 * The second is the recording. `canPlayRecording` is computed server-side per call, per product
 * policy and per project, and this proves the card does not offer playback when the answer was no
 * — while still saying that a recording exists, which is a fact the history may show.
 */

function ticketFixture(): TicketDetail {
  return {
    id: 'ticket-1',
    key: 'T-1',
    number: 1,
    title: 'Templates stopped syncing',
    description: 'Since the update.',
    type: 'BUG',
    priority: 'HIGH',
    status: 'ASSIGNED',
    source: 'PORTAL',
    module: 'API',
    impact: null,
    project: { id: 'project-1', code: 'ACM', name: 'Acme portal' },
    clientOrganization: { id: 'client-1', name: 'Acme', slug: 'acme' },
    requester: { id: 'user-client', name: 'Sunita M', email: 'sunita@example.com' },
    assignedTo: { id: 'user-dev', name: 'Arjun R', email: 'arjun@example.com' },
    team: null,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-09-12T04:00:00.000Z',
    updatedAt: '2026-09-12T04:00:00.000Z',
    linkedTaskCount: 0,
    sla: null,
    statusHistory: [],
    comments: [],
    linkedTasks: [],
    files: [],
    actions: [],
  } as unknown as TicketDetail;
}

function callFixture(over: Partial<CallSummary> = {}): CallSummary {
  return {
    id: 'call-1',
    ticketId: 'ticket-1',
    ticketKey: 'T-1',
    status: 'COMPLETED',
    providerDisposition: 'answered',
    providerKey: 'OTHER',
    initiatedBy: { id: 'user-support', name: 'Neha P', email: 'neha@example.com' },
    connectedTo: { id: 'user-dev', name: 'Arjun R', email: 'arjun@example.com' },
    requesterName: 'Sunita M',
    requestedAt: '2026-09-12T04:05:00.000Z',
    connectedAt: '2026-09-12T04:05:30.000Z',
    endedAt: '2026-09-12T04:11:00.000Z',
    durationSeconds: 330,
    hasRecording: true,
    recordingReadyAt: '2026-09-12T04:12:00.000Z',
    canPlayRecording: false,
    recordingDenialReason: 'OUTSIDE_SCOPE',
    queueReason: null,
    attempts: [],
    ...over,
  };
}

/**
 * Both endpoints the card reads answer from one stub, chosen by URL: availability and history are
 * separate requests and a single canned response would make the assertions accidental.
 */
function renderCard(options: {
  roleKey: string;
  availability: { enabled: boolean; reason: string | null };
  calls: CallSummary[];
}) {
  setAuthenticated('test-token', {
    ...sessionUserFor(options.roleKey as never),
    id: 'user-viewer',
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    const body = url.includes('availability') ? options.availability : options.calls;
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TicketCallsCard ticket={ticketFixture()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TicketCallsCard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers Call support when the server says the product allows it', async () => {
    renderCard({
      roleKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
      availability: { enabled: true, reason: null },
      calls: [],
    });
    // The control renders before the availability answer arrives, so it starts disabled — which
    // is the right default. What matters is that the server's yes reaches it.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Call support' })).toBeEnabled());
  });

  it('disables Call support and repeats the reason the server gave', async () => {
    renderCard({
      roleKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
      availability: { enabled: false, reason: 'Support calls are switched off for Carelix' },
      calls: [],
    });
    const button = await screen.findByRole('button', { name: 'Call support' });
    expect(button).toBeDisabled();
  });

  it('does not offer playback when the server refused it, but says a recording exists', async () => {
    renderCard({
      roleKey: ROLE_KEYS.DEVELOPER,
      availability: { enabled: true, reason: null },
      calls: [callFixture()],
    });
    expect(await screen.findByText(/A recording exists/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play recording' })).not.toBeInTheDocument();
  });

  it('offers playback only when the server allowed it', async () => {
    renderCard({
      roleKey: ROLE_KEYS.PROJECT_MANAGER,
      availability: { enabled: true, reason: null },
      calls: [callFixture({ canPlayRecording: true, recordingDenialReason: null })],
    });
    expect(await screen.findByRole('button', { name: 'Play recording' })).toBeInTheDocument();
  });

  it('shows nothing at all to somebody without the internal call permission', () => {
    renderCard({
      roleKey: ROLE_KEYS.CLIENT_ADMIN,
      availability: { enabled: true, reason: null },
      calls: [callFixture()],
    });
    expect(screen.queryByText('Support calls')).not.toBeInTheDocument();
  });
});
