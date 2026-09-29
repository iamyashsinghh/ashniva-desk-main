import { PERMISSIONS, REAUTH_HEADER, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { contractDetail, routeFetch, sentRequest } from './commercial-test-data';
import { ContractDetailScreen } from './ContractDetailScreen';

/**
 * One contract. Money the caller may not see stays hidden, writes are gated on the permission
 * their endpoint checks, and moving hours sends a fresh re-auth token.
 */

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

const navigation = {
  onEdit: jest.fn(),
  onOpenProject: jest.fn(),
  onOpenMilestone: jest.fn(),
  onAddMilestone: jest.fn(),
  onOpenChangeRequest: jest.fn(),
  onOpenTask: jest.fn(),
};

function render() {
  return renderScreen(<ContractDetailScreen contractId="ct-1" {...navigation} />);
}

beforeEach(() => {
  fetchMock.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('shows the terms, and the internal cost only to somebody with cost:read', async () => {
  signInWith([]);
  routeFetch(fetchMock, { 'GET /contracts/ct-1': contractDetail() });
  const view = await render();

  expect(await view.findByText('Managed support 2026')).toBeTruthy();
  expect(view.getByText('Break-fix support for the storefront.')).toBeTruthy();
  expect(view.getByText('Renewal price rises 8%')).toBeTruthy();
  expect(view.queryByText('Internal cost (team only)')).toBeNull();
  expect(view.queryByRole('button', { name: 'Edit' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Archive' })).toBeNull();
});

it('lets a contract manager edit, and archive after confirming', async () => {
  signInWith([PERMISSIONS.CONTRACT_MANAGE, PERMISSIONS.COST_READ]);
  routeFetch(fetchMock, {
    'POST /contracts/ct-1/archive': contractDetail({ status: 'ARCHIVED' }),
    'GET /contracts/ct-1': contractDetail(),
  });
  const view = await render();

  expect(await view.findByText('Internal cost (team only)')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Edit' }));
  expect(navigation.onEdit).toHaveBeenCalledWith('ct-1');

  await fireEvent.press(view.getByRole('button', { name: 'Archive' }));
  expect(sentRequest(fetchMock, '/contracts/ct-1/archive', 'POST')).toBeNull();
  const buttons = view.getAllByRole('button', { name: 'Archive' });
  await fireEvent.press(buttons[buttons.length - 1]!);
  await waitFor(() =>
    expect(sentRequest(fetchMock, '/contracts/ct-1/archive', 'POST')).not.toBeNull(),
  );
});

it('offers no writes on an archived contract, even to a manager', async () => {
  signInWith([PERMISSIONS.CONTRACT_MANAGE, PERMISSIONS.CONTRACT_ADJUST_HOURS]);
  routeFetch(fetchMock, {
    'GET /contracts/ct-1/ledger': { items: [], nextCursor: null },
    'GET /contracts/ct-1': contractDetail({ status: 'ARCHIVED' }),
  });
  const view = await render();

  expect(await view.findByText(/This contract is archived/)).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Edit' })).toBeNull();
  await fireEvent.press(view.getByRole('tab', { name: 'Support hours' }));
  expect(view.queryByRole('button', { name: 'Adjust hours' })).toBeNull();
});

it('records purchased hours in minutes, behind the password', async () => {
  signInWith([PERMISSIONS.CONTRACT_ADJUST_HOURS]);
  routeFetch(fetchMock, {
    'POST /auth/reauth': { reauthToken: 'reauth-1', expiresInSeconds: 300 },
    'POST /contracts/ct-1/hours': contractDetail().hours,
    'GET /contracts/ct-1/ledger': { items: [], nextCursor: null },
    'GET /contracts/ct-1': contractDetail(),
  });
  const view = await render();

  await fireEvent.press(await view.findByRole('tab', { name: 'Support hours' }));
  await fireEvent.press(await view.findByRole('button', { name: 'Adjust hours' }));
  await fireEvent.changeText(view.getByLabelText('Hours'), '2.5');
  await fireEvent.changeText(view.getByLabelText('Reason'), 'Bought a top-up pack');
  expect(view.getByRole('button', { name: 'Record' }).props.accessibilityState.disabled).toBe(true);

  await fireEvent.changeText(view.getByLabelText('Your sign-in password'), 'correct horse');
  await fireEvent.press(view.getByRole('button', { name: 'Record' }));

  await waitFor(() =>
    expect(sentRequest(fetchMock, '/contracts/ct-1/hours', 'POST')).not.toBeNull(),
  );
  expect(sentRequest(fetchMock, '/auth/reauth', 'POST')?.body).toEqual({
    password: 'correct horse',
  });
  const hours = sentRequest(fetchMock, '/contracts/ct-1/hours', 'POST');
  expect(hours?.headers[REAUTH_HEADER]).toBe('reauth-1');
  expect(hours?.body).toMatchObject({
    kind: 'PURCHASED',
    minutes: 150,
    reason: 'Bought a top-up pack',
  });
  await waitFor(() => expect(view.queryByText('Adjust support hours')).toBeNull());
});
