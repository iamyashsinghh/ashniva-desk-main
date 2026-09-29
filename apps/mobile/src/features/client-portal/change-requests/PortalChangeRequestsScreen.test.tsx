import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../../shared/testing/harness';
import { PortalChangeRequestsScreen } from './PortalChangeRequestsScreen';

/**
 * The client's change-request list: filtered by the API, and the "raise one" button for a role
 * that may raise — which saves a draft through the portal endpoint and opens it.
 */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../../auth/auth-api') as {
  restoreSession: jest.Mock;
};

const fetchMock = jest.fn();

function signIn(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
      roleName: 'Client Employee',
      permissions,
      organization: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Northwind',
        slug: 'northwind',
        isServiceProvider: false,
      },
    }),
  });
}

const SUMMARY = {
  id: 'cr1',
  number: 'CR-0012',
  title: 'Add an export button',
  status: 'CLIENT_REVIEW',
  project: { id: 'p1', code: 'WEB', name: 'Website rebuild' },
  requestedBy: { id: 'u2', name: 'Alex Kim', email: 'alex@example.com' },
  estimatedMinutes: 480,
  costImpact: '1200.00',
  currency: 'USD',
  timelineImpactDays: 3,
  scheduledFor: null,
  submittedAt: '2026-09-10T09:00:00.000Z',
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-12T09:00:00.000Z',
};

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockImplementation((_url: string, init?: { method?: string }) =>
    Promise.resolve(
      jsonResponse(
        init?.method === 'POST'
          ? { ...SUMMARY, id: 'cr-new', status: 'DRAFT' }
          : { items: [SUMMARY], nextCursor: null },
      ),
    ),
  );
});

it('lists requests with the one waiting on the client marked, and opens it', async () => {
  signIn([PERMISSIONS.CHANGE_REQUEST_READ]);
  const onOpen = jest.fn();
  const view = await renderScreen(<PortalChangeRequestsScreen onOpen={onOpen} />);

  expect(await view.findByText('Add an export button')).toBeTruthy();
  expect(view.getByText('Your decision is needed')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Raise a change request' })).toBeNull();

  await fireEvent.press(view.getByRole('button', { name: 'CR-0012 Add an export button' }));
  expect(onOpen).toHaveBeenCalledWith('cr1');
});

it('asks the API for the statuses of the chosen view', async () => {
  signIn([PERMISSIONS.CHANGE_REQUEST_READ]);
  const view = await renderScreen(<PortalChangeRequestsScreen onOpen={jest.fn()} />);
  await view.findByText('Add an export button');

  await fireEvent.press(view.getByRole('button', { name: 'Needs your decision' }));

  await waitFor(() =>
    expect(requestedPaths(fetchMock).some((path) => path.includes('status=CLIENT_REVIEW'))).toBe(
      true,
    ),
  );
});

it('raises a draft through the portal and opens it', async () => {
  signIn([PERMISSIONS.CHANGE_REQUEST_READ, PERMISSIONS.CHANGE_REQUEST_RAISE]);
  const onOpen = jest.fn();
  const view = await renderScreen(<PortalChangeRequestsScreen onOpen={onOpen} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Raise a change request' }));
  const save = view.getByRole('button', { name: 'Save draft' });
  expect(save.props.accessibilityState).toMatchObject({ disabled: true });

  await fireEvent.changeText(view.getByLabelText('Title'), 'Dark mode');
  await fireEvent.changeText(
    view.getByLabelText('What should change'),
    'Offer a dark theme on every screen.',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save draft' }));

  await waitFor(() => expect(onOpen).toHaveBeenCalledWith('cr-new'));
  const [url, init] = fetchMock.mock.calls.find(
    ([, options]) => (options as { method?: string } | undefined)?.method === 'POST',
  ) as [string, { body: string }];
  expect(url).toContain('/portal/change-requests');
  expect(JSON.parse(init.body)).toEqual({
    title: 'Dark mode',
    description: 'Offer a dark theme on every screen.',
  });
});
