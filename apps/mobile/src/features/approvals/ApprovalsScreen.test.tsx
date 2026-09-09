import { APPROVAL_STATUS, PERMISSIONS, ROLE_KEYS, type ApprovalSummary } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { ApprovalsScreen } from './ApprovalsScreen';

/**
 * Which door the app knocks on, and what it draws when there is nothing behind it.
 *
 * The audience test is the one that matters. The provider's endpoint and the client's return
 * deliberately different shapes, and each service refuses the other side before it queries
 * anything — so sending a client to `/approvals` would be a 403 on every open. Proving the path
 * proves the app never asks.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const MANAGER = sessionUser({
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  roleName: 'Project Manager',
  permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.APPROVAL_MANAGE],
});

const CLIENT = sessionUser({
  roleKey: ROLE_KEYS.CLIENT_ADMIN,
  roleName: 'Client Admin',
  permissions: [PERMISSIONS.PROJECT_READ],
  organization: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Northwind',
    slug: 'northwind',
    isServiceProvider: false,
  },
});

function summary(): ApprovalSummary {
  return {
    id: 'a1',
    title: 'Phase 2 handover',
    status: APPROVAL_STATUS.PUBLISHED,
    subject: { type: 'MILESTONE', id: 'm1', label: 'Phase 2', link: null },
    clientOrganization: { id: 'c1', name: 'Northwind', slug: 'northwind' },
    project: null,
    contract: null,
    requestedBy: { id: 'u1', name: 'Priya Rao', email: 'priya@example.com' },
    publishedAt: null,
    dueDate: null,
    decidedBy: null,
    decidedAt: null,
    isOverdue: false,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('somebody at the provider', () => {
  beforeEach(() => restoreSession.mockResolvedValue({ status: 'signed-in', user: MANAGER }));

  it('reads the internal list, not the portal one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [summary()], nextCursor: null, total: 1 }));
    const view = await renderScreen(<ApprovalsScreen onOpen={jest.fn()} />);

    await view.findByText('Phase 2 handover');
    const paths = requestedPaths(fetchMock);
    expect(paths.some((path) => path.includes('/approvals?'))).toBe(true);
    expect(paths.some((path) => path.includes('/portal/approvals'))).toBe(false);
  });

  it('names the view in the empty state rather than the screen', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], nextCursor: null, total: 0 }));
    const view = await renderScreen(<ApprovalsScreen onOpen={jest.fn()} />);

    expect(await view.findByText('Nothing waiting on you')).toBeTruthy();

    await fireEvent.press(view.getByRole('tab', { name: 'With client' }));
    expect(await view.findByText('Nothing with the client')).toBeTruthy();
  });

  it('shows the API’s refusal as a sentence, with a retry', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: 'Approvals are not available to you' }, 403),
    );
    const view = await renderScreen(<ApprovalsScreen onOpen={jest.fn()} />);

    expect(await view.findByText('Approvals are not available to you')).toBeTruthy();
    expect(await view.findByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('opens the one that was tapped', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [summary()], nextCursor: null, total: 1 }));
    const onOpen = jest.fn();
    const view = await renderScreen(<ApprovalsScreen onOpen={onOpen} />);

    await fireEvent.press(await view.findByRole('button', { name: 'Phase 2 handover' }));
    expect(onOpen).toHaveBeenCalledWith('a1');
  });
});

describe('somebody at a client', () => {
  beforeEach(() => restoreSession.mockResolvedValue({ status: 'signed-in', user: CLIENT }));

  it('reads the portal list and never the internal one', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const view = await renderScreen(<ApprovalsScreen onOpen={jest.fn()} />);

    await view.findByText('Nothing to approve');
    expect(requestedPaths(fetchMock).every((path) => path.includes('/portal/approvals'))).toBe(
      true,
    );
  });
});
