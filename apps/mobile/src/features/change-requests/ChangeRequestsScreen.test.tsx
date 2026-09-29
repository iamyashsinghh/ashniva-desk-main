import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths, sessionUser } from '../../shared/testing/harness';
import { changeRequestSummary, routeFetch } from '../contracts/commercial-test-data';
import { ChangeRequestsScreen } from './ChangeRequestsScreen';

/** The change-request list: the web's "who is it waiting on" views, sent as status filters. */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };
const fetchMock = jest.fn();

function signInWith(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey: ROLE_KEYS.PROJECT_MANAGER,
      permissions: [PERMISSIONS.CHANGE_REQUEST_READ, ...permissions],
    }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('lists open requests and opens one', async () => {
  signInWith([]);
  routeFetch(fetchMock, {
    'GET /change-requests': { items: [changeRequestSummary()], nextCursor: null },
  });
  const onOpen = jest.fn();
  const view = await renderScreen(<ChangeRequestsScreen onOpen={onOpen} onCreate={jest.fn()} />);

  expect(await view.findByText('Add gift wrapping at checkout')).toBeTruthy();
  expect(view.getByText('Internal review')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Raise a change request' })).toBeNull();
  const first = requestedPaths(fetchMock)[0] ?? '';
  expect(decodeURIComponent(first)).toContain('status=DRAFT,SUBMITTED,INTERNAL_REVIEW');

  await fireEvent.press(view.getByLabelText(/CR-0012/));
  expect(onOpen).toHaveBeenCalledWith('cr-1');
});

it('sends the closed statuses for the Closed view, and none for All', async () => {
  signInWith([]);
  routeFetch(fetchMock, { 'GET /change-requests': { items: [], nextCursor: null } });
  const view = await renderScreen(<ChangeRequestsScreen onOpen={jest.fn()} onCreate={jest.fn()} />);

  await view.findByText('No change requests');
  await fireEvent.press(view.getByRole('tab', { name: 'Closed' }));
  await waitFor(() =>
    expect(
      requestedPaths(fetchMock).some((path) =>
        decodeURIComponent(path).includes('status=COMPLETED,REJECTED,CANCELLED'),
      ),
    ).toBe(true),
  );

  await fireEvent.press(view.getByRole('tab', { name: 'All' }));
  await waitFor(() => {
    const last = requestedPaths(fetchMock).at(-1) ?? '';
    expect(last).not.toContain('status=');
  });
});

it('offers raising one only with change-request:raise', async () => {
  signInWith([PERMISSIONS.CHANGE_REQUEST_RAISE]);
  routeFetch(fetchMock, { 'GET /change-requests': { items: [], nextCursor: null } });
  const onCreate = jest.fn();
  const view = await renderScreen(<ChangeRequestsScreen onOpen={jest.fn()} onCreate={onCreate} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Raise a change request' }));
  expect(onCreate).toHaveBeenCalled();
});
