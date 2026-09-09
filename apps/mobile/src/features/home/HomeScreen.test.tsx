import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { HomeScreen } from './HomeScreen';

/**
 * The rows behind Home, and who gets which.
 *
 * The bar holds five and is full, so everything else is a row here — and a row is offered on the
 * same basis as a tab: what the person may actually do. A row appearing is never authority; the
 * API decides behind every one of them. What these tests prove is that nobody is offered a door
 * that is bolted, because a tap that answers 403 is worse than no row.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const CLIENT_ORGANIZATION = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Northwind',
  slug: 'northwind',
  isServiceProvider: false,
};

function handlers() {
  return {
    onOpenProjects: jest.fn(),
    onOpenConversations: jest.fn(),
    onOpenQa: jest.fn(),
    onOpenApprovals: jest.fn(),
    onOpenSignOffs: jest.fn(),
    onOpenMyTime: jest.fn(),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(jsonResponse({ kpis: { pendingApprovals: 0 } }));
});

describe('a developer', () => {
  beforeEach(() =>
    restoreSession.mockResolvedValue({
      status: 'signed-in',
      user: sessionUser({
        roleKey: ROLE_KEYS.DEVELOPER,
        permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.REPORT_READ_OWN],
      }),
    }),
  );

  it('is offered their own logged time, and opens it', async () => {
    const props = handlers();
    const view = await renderScreen(<HomeScreen {...props} />);

    await fireEvent.press(await view.findByRole('button', { name: 'My time' }));
    expect(props.onOpenMyTime).toHaveBeenCalled();
  });

  it('is offered approvals through the internal endpoint’s permission', async () => {
    const view = await renderScreen(<HomeScreen {...handlers()} />);
    expect(await view.findByRole('button', { name: 'Approvals' })).toBeTruthy();
  });

  it('is not offered a client’s sign-offs', async () => {
    const view = await renderScreen(<HomeScreen {...handlers()} />);
    await view.findByRole('button', { name: 'Approvals' });
    expect(view.queryByRole('button', { name: 'Sign-offs' })).toBeNull();
  });

  it('asks the portal for nothing at all', async () => {
    // `GET /portal/home` refuses a provider. Asking on their behalf would put a guaranteed 403 in
    // the cache of every internal user who opened the app.
    const view = await renderScreen(<HomeScreen {...handlers()} />);
    await view.findByRole('button', { name: 'Approvals' });
    expect(requestedPaths(fetchMock).some((path) => path.includes('/portal/'))).toBe(false);
  });
});

describe('an internal employee without project access', () => {
  beforeEach(() =>
    restoreSession.mockResolvedValue({
      status: 'signed-in',
      user: sessionUser({
        roleKey: ROLE_KEYS.INTERNAL_EMPLOYEE,
        roleName: 'Internal Employee',
        permissions: [PERMISSIONS.TICKET_RAISE],
      }),
    }),
  );

  it('is offered neither approvals nor time they cannot read', async () => {
    const view = await renderScreen(<HomeScreen {...handlers()} />);

    await view.findByText('On your phone');
    expect(view.queryByRole('button', { name: 'Approvals' })).toBeNull();
    expect(view.queryByRole('button', { name: 'My time' })).toBeNull();
  });
});

describe('a client', () => {
  beforeEach(() =>
    restoreSession.mockResolvedValue({
      status: 'signed-in',
      user: sessionUser({
        roleKey: ROLE_KEYS.CLIENT_ADMIN,
        roleName: 'Client Admin',
        permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.APPROVAL_DECIDE],
        organization: CLIENT_ORGANIZATION,
      }),
    }),
  );

  it('is offered approvals and sign-offs, and neither projects nor messages', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ kpis: { pendingApprovals: 3 } }));
    const view = await renderScreen(<HomeScreen {...handlers()} />);

    // Waiting on the badge rather than the bare row: it is the last thing this screen settles on,
    // so asserting on it first means the rest is asserted against a screen that has stopped
    // changing.
    expect(await view.findByRole('button', { name: 'Approvals, 3 waiting for you' })).toBeTruthy();
    expect(await view.findByRole('button', { name: 'Sign-offs' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Projects' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Messages' })).toBeNull();
  });

  it('says what the count on the approvals row counts', async () => {
    // A number on its own is a puzzle to a screen reader. The unit is part of the label.
    fetchMock.mockResolvedValue(jsonResponse({ kpis: { pendingApprovals: 1 } }));
    const view = await renderScreen(<HomeScreen {...handlers()} />);

    expect(await view.findByRole('button', { name: 'Approvals, 1 waiting for you' })).toBeTruthy();
  });

  it('still draws every row when the count cannot be fetched', async () => {
    // Home has to paint on a cold start with no network. The badge is additive; nothing gates on
    // it, and there is no error state for it to put on this screen.
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Unavailable' }, 503));
    const view = await renderScreen(<HomeScreen {...handlers()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(await view.findByRole('button', { name: 'Approvals' })).toBeTruthy();
    expect(await view.findByRole('button', { name: 'Sign-offs' })).toBeTruthy();
  });
});
