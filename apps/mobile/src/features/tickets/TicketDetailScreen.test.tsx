import {
  CLIENT_VISIBLE_STATUS,
  PERMISSIONS,
  PRIORITY,
  ROLE_KEYS,
  TICKET_ACTION,
  TICKET_SOURCE,
  TICKET_STATUS,
  TICKET_TYPE,
  VISIBILITY,
  type CommentSummary,
  type PortalTicketDetail,
  type TicketDetail,
} from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { TicketDetailScreen } from './TicketDetailScreen';

/**
 * Which ticket a person is shown, and what they may add to it.
 *
 * A client must be sent to the portal endpoint — its response has no internal notes to leak — and
 * never to `/tickets/:id`. Staff see the internal-note tab only with `comment:internal`, and a note
 * is only sent as internal after that tab was chosen.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };
const fetchMock = jest.fn();

const person = { id: 'u1', name: 'Priya Rao', email: 'priya@example.com' };

function comment(id: string, body: string, visibility: CommentSummary['visibility']) {
  return {
    id,
    body,
    visibility,
    author: person,
    createdAt: '2026-09-28T09:00:00.000Z',
  } as unknown as CommentSummary;
}

const STAFF_TICKET = {
  id: 't1',
  number: 7,
  key: 'T-7',
  title: 'Checkout spins forever',
  type: TICKET_TYPE.SUPPORT,
  priority: PRIORITY.HIGH,
  status: TICKET_STATUS.IN_PROGRESS,
  source: TICKET_SOURCE.PORTAL,
  project: null,
  clientOrganization: { id: 'c1', name: 'Northwind', slug: 'northwind' },
  requester: person,
  assignedTo: null,
  team: null,
  module: null,
  productVersion: null,
  linkedTaskCount: 0,
  createdAt: '2026-09-28T08:00:00.000Z',
  updatedAt: '2026-09-28T09:00:00.000Z',
  resolvedAt: null,
  closedAt: null,
  sla: null,
  description: 'The card step never finishes.',
  impact: null,
  resolution: null,
  history: [],
  comments: [
    comment('c1', 'We are looking at it', VISIBILITY.CLIENT),
    comment('c2', 'Gateway sandbox is down', VISIBILITY.INTERNAL),
  ],
  linkedTasks: [],
  files: [],
  actions: [
    { action: TICKET_ACTION.RESOLVE, enabled: true },
    { action: TICKET_ACTION.REPLY_PUBLIC, enabled: true },
    { action: TICKET_ACTION.NOTE_INTERNAL, enabled: true },
  ],
} as unknown as TicketDetail;

const PORTAL_TICKET = {
  id: 't1',
  number: 7,
  key: 'T-7',
  title: 'Checkout spins forever',
  type: TICKET_TYPE.SUPPORT,
  priority: PRIORITY.HIGH,
  status: CLIENT_VISIBLE_STATUS.COMPLETED,
  needsYourAction: true,
  project: null,
  requester: person,
  createdAt: '2026-09-28T08:00:00.000Z',
  updatedAt: '2026-09-28T09:00:00.000Z',
  resolvedAt: '2026-09-28T10:00:00.000Z',
  sla: null,
  description: 'The card step never finishes.',
  impact: null,
  resolution: 'Gateway timeout raised.',
  replies: [comment('c1', 'We are looking at it', VISIBILITY.CLIENT)],
  files: [],
  canReply: true,
  canReopen: true,
  canClose: true,
} as unknown as PortalTicketDetail;

function respond(detail: unknown) {
  fetchMock.mockImplementation((url: string) => {
    const path = String(url);
    if (path.endsWith('/tickets/t1')) {
      return Promise.resolve(jsonResponse(detail));
    }
    if (path.endsWith('/close')) {
      return Promise.resolve(jsonResponse(detail));
    }
    return Promise.resolve(jsonResponse({ message: 'Not found' }, 404));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('a client', () => {
  beforeEach(() =>
    restoreSession.mockResolvedValue({
      status: 'signed-in',
      user: sessionUser({
        roleKey: ROLE_KEYS.CLIENT_ADMIN,
        permissions: [PERMISSIONS.TICKET_RAISE],
        organization: { id: 'c1', name: 'Northwind', slug: 'northwind', isServiceProvider: false },
      }),
    }),
  );

  it('reads the ticket from the portal, and can confirm the fix', async () => {
    respond(PORTAL_TICKET);
    const view = await renderScreen(<TicketDetailScreen ticketId="t1" onOpenChat={null} />);

    await view.findByText('Gateway timeout raised.');
    const ticketReads = requestedPaths(fetchMock).filter((path) => path.includes('/tickets/t1'));
    expect(ticketReads.length).toBeGreaterThan(0);
    expect(ticketReads.every((path) => path.includes('/portal/tickets/t1'))).toBe(true);

    await fireEvent.press(await view.findByRole('button', { name: 'Confirm & close' }));
    await waitFor(() =>
      expect(
        requestedPaths(fetchMock).some((path) => path.endsWith('/portal/tickets/t1/close')),
      ).toBe(true),
    );
  });
});

describe('staff', () => {
  const staff = (permissions: string[]) =>
    restoreSession.mockResolvedValue({
      status: 'signed-in',
      user: sessionUser({
        roleKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
        permissions: permissions as ReturnType<typeof sessionUser>['permissions'],
      }),
    });

  it('offers no internal tab without comment:internal', async () => {
    staff([PERMISSIONS.TICKET_READ]);
    respond(STAFF_TICKET);
    const view = await renderScreen(<TicketDetailScreen ticketId="t1" onOpenChat={null} />);

    await view.findByText('We are looking at it');
    expect(view.queryByText('Internal (1)')).toBeNull();
    expect(view.queryByText('Gateway sandbox is down')).toBeNull();
  });

  it('sends a note as internal only once the internal tab is chosen', async () => {
    staff([PERMISSIONS.TICKET_READ, PERMISSIONS.COMMENT_INTERNAL]);
    respond(STAFF_TICKET);
    const view = await renderScreen(<TicketDetailScreen ticketId="t1" onOpenChat={null} />);

    await fireEvent.press(await view.findByText('Internal (1)'));
    await view.findByText('Gateway sandbox is down');
    await fireEvent.changeText(view.getByLabelText('Your internal note'), 'Chasing ops');
    await fireEvent.press(view.getByRole('button', { name: 'Add internal note' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((entry) => String(entry[0]).endsWith('/comments'));
      expect(call).toBeDefined();
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
        body: 'Chasing ops',
        visibility: VISIBILITY.INTERNAL,
      });
    });
  });
});
