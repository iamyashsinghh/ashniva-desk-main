import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths, sessionUser } from '../../shared/testing/harness';
import { contractSummary, routeFetch } from './commercial-test-data';
import { ContractsScreen } from './ContractsScreen';

/** The provider's contract list: server-side views, the rows, and who may start a new one. */

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
      permissions: [PERMISSIONS.CONTRACT_READ, ...permissions],
    }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('lists active contracts with their remaining hours and opens one', async () => {
  signInWith([]);
  routeFetch(fetchMock, {
    'GET /contracts': { items: [contractSummary()], nextCursor: null },
  });
  const onOpen = jest.fn();
  const view = await renderScreen(<ContractsScreen onOpen={onOpen} onCreate={jest.fn()} />);

  expect(await view.findByText('Managed support 2026')).toBeTruthy();
  expect(requestedPaths(fetchMock).some((path) => path.includes('view=active'))).toBe(true);
  expect(view.queryByRole('button', { name: 'New contract' })).toBeNull();

  await fireEvent.press(view.getByLabelText(/CT-2026-0007/));
  expect(onOpen).toHaveBeenCalledWith('ct-1');
});

it('asks the server for the chosen view rather than filtering what it has', async () => {
  signInWith([]);
  routeFetch(fetchMock, { 'GET /contracts': { items: [], nextCursor: null } });
  const view = await renderScreen(<ContractsScreen onOpen={jest.fn()} onCreate={jest.fn()} />);

  expect(await view.findByText('No contracts here')).toBeTruthy();
  await fireEvent.press(view.getByRole('tab', { name: /Expiring/ }));
  await waitFor(() =>
    expect(requestedPaths(fetchMock).some((path) => path.includes('view=expiring'))).toBe(true),
  );
});

it('offers "New contract" only with contract:manage', async () => {
  signInWith([PERMISSIONS.CONTRACT_MANAGE]);
  routeFetch(fetchMock, { 'GET /contracts': { items: [], nextCursor: null } });
  const onCreate = jest.fn();
  const view = await renderScreen(<ContractsScreen onOpen={jest.fn()} onCreate={onCreate} />);

  await fireEvent.press(await view.findByRole('button', { name: 'New contract' }));
  expect(onCreate).toHaveBeenCalled();
});

it('says so when the list cannot be read', async () => {
  signInWith([]);
  routeFetch(fetchMock, {});
  const view = await renderScreen(<ContractsScreen onOpen={jest.fn()} onCreate={jest.fn()} />);

  expect(await view.findByRole('button', { name: 'Try again' })).toBeTruthy();
});
