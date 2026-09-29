import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { changeRequestDetail, routeFetch, sentRequest } from '../contracts/commercial-test-data';
import { ChangeRequestDetailScreen } from './ChangeRequestDetailScreen';

/**
 * One change request. The buttons are the API's `actions`, in the web's order: an enabled one
 * runs, a refused one is shown disabled with the API's reason, and a step that needs a reason
 * will not go without one.
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
      permissions: [PERMISSIONS.CHANGE_REQUEST_READ, ...permissions],
    }),
  });
}

const navigation = {
  onEdit: jest.fn(),
  onOpenProject: jest.fn(),
  onOpenContract: jest.fn(),
  onOpenTask: jest.fn(),
  onOpenMilestone: jest.fn(),
};

function render() {
  return renderScreen(<ChangeRequestDetailScreen changeRequestId="cr-1" {...navigation} />);
}

async function pressLast(view: Awaited<ReturnType<typeof render>>, name: string) {
  const buttons = view.getAllByRole('button', { name });
  await fireEvent.press(buttons[buttons.length - 1]!);
}

beforeEach(() => {
  fetchMock.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('shows the request and no actions when the API lists none', async () => {
  signInWith([]);
  routeFetch(fetchMock, { 'GET /change-requests/cr-1': changeRequestDetail() });
  const view = await render();

  expect(await view.findByText('Add gift wrapping at checkout')).toBeTruthy();
  expect(view.getByText('Shoppers want a gift-wrap option on the checkout page.')).toBeTruthy();
  expect(view.getByText('Not estimated yet')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Estimate' })).toBeNull();
  expect(view.queryByRole('button', { name: /actions/i })).toBeNull();
});

it('sends to the client from the bar, and shows a refused action with its reason', async () => {
  signInWith([PERMISSIONS.CHANGE_REQUEST_MANAGE]);
  routeFetch(fetchMock, {
    'POST /change-requests/cr-1/send-to-client': changeRequestDetail({ status: 'CLIENT_REVIEW' }),
    'GET /change-requests/cr-1': changeRequestDetail({
      actions: [
        { action: 'send-to-client', enabled: true },
        { action: 'reject', enabled: false, reason: 'Estimate the change before rejecting it' },
      ],
    }),
  });
  const view = await render();

  await fireEvent.press(await view.findByRole('button', { name: 'More actions' }));
  expect(view.getByText('Estimate the change before rejecting it')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Reject' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(view.getAllByRole('button', { name: 'Close' })[0]!);

  await pressLast(view, 'Send to client for approval');
  await fireEvent.changeText(view.getByLabelText('Message to the client'), 'Please review');
  await pressLast(view, 'Send');

  await waitFor(() =>
    expect(sentRequest(fetchMock, '/change-requests/cr-1/send-to-client', 'POST')?.body).toEqual({
      note: 'Please review',
    }),
  );
});

it('will not reject without a reason of three characters', async () => {
  signInWith([PERMISSIONS.CHANGE_REQUEST_MANAGE]);
  routeFetch(fetchMock, {
    'POST /change-requests/cr-1/reject': changeRequestDetail({ status: 'REJECTED' }),
    'GET /change-requests/cr-1': changeRequestDetail({
      actions: [{ action: 'reject', enabled: true }],
    }),
  });
  const view = await render();

  await fireEvent.press(await view.findByRole('button', { name: 'Actions' }));
  await fireEvent.press(view.getByRole('button', { name: 'Reject' }));
  await fireEvent.changeText(view.getByLabelText('Why?'), 'no');
  expect(
    view.getAllByRole('button', { name: 'Reject' }).at(-1)?.props.accessibilityState.disabled,
  ).toBe(true);

  await fireEvent.changeText(view.getByLabelText('Why?'), 'Out of scope for this phase');
  await pressLast(view, 'Reject');
  await waitFor(() =>
    expect(sentRequest(fetchMock, '/change-requests/cr-1/reject', 'POST')?.body).toEqual({
      note: 'Out of scope for this phase',
    }),
  );
});

it('lets a manager estimate an open request, in minutes', async () => {
  signInWith([PERMISSIONS.CHANGE_REQUEST_MANAGE]);
  routeFetch(fetchMock, {
    'PATCH /change-requests/cr-1': changeRequestDetail(),
    'GET /change-requests/cr-1': changeRequestDetail(),
  });
  const view = await render();

  await fireEvent.press(await view.findByRole('button', { name: 'Estimate' }));
  await fireEvent.changeText(view.getByLabelText('Effort (hours)'), '6');
  await fireEvent.changeText(view.getByLabelText('Cost impact'), '15000');
  await pressLast(view, 'Save');

  await waitFor(() =>
    expect(sentRequest(fetchMock, '/change-requests/cr-1', 'PATCH')?.body).toMatchObject({
      estimatedMinutes: 360,
      costImpact: '15000',
      currency: 'INR',
      timelineImpactDays: null,
    }),
  );
});

it('posts an internal note to the team only', async () => {
  signInWith([]);
  routeFetch(fetchMock, {
    'POST /change-requests/cr-1/comments': { id: 'c-1' },
    'GET /change-requests/cr-1': changeRequestDetail(),
  });
  const view = await render();

  await fireEvent.press(await view.findByRole('tab', { name: 'Internal (0)' }));
  await fireEvent.changeText(view.getByLabelText('Internal note'), 'Check with finance');
  await fireEvent.press(view.getByRole('button', { name: 'Add internal note' }));

  await waitFor(() =>
    expect(sentRequest(fetchMock, '/change-requests/cr-1/comments', 'POST')?.body).toEqual({
      body: 'Check with finance',
      visibility: 'INTERNAL',
    }),
  );
});
