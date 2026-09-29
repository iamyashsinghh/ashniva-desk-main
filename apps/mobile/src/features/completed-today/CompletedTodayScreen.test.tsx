import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { CompletedTodayScreen } from './CompletedTodayScreen';
import { clientUpdate, clientUpdatesApi } from './completed-today-test-data';

/**
 * Completed Today.
 *
 * Publishing, editing and withdrawing are offered on `client-update:publish`, as on the web; a
 * reader without it sees the queue and why they cannot act on it, and sends nothing.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const PUBLISHED = clientUpdate({
  id: 'u9',
  title: 'Invoices download as PDF',
  status: 'PUBLISHED',
  task: null,
  publishedBy: { id: 's1', name: 'Sara Senior', email: 's@example.com' },
});

function signInWith(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey: ROLE_KEYS.TEAM_LEAD, permissions }),
  });
}

function writes() {
  return fetchMock.mock.calls
    .filter((call) => {
      const method = (call[1] as { method?: string } | undefined)?.method;
      return method !== undefined && method !== 'GET';
    })
    .map((call) => ({
      url: String(call[0]),
      method: (call[1] as { method: string }).method,
      body: (call[1] as { body?: string }).body,
    }));
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    clientUpdatesApi(
      [
        clientUpdate(),
        clientUpdate({
          id: 'u2',
          title: 'Search is faster',
          task: { id: 'task-2', key: 'ACM-13', title: 'Search index' },
        }),
      ],
      [PUBLISHED],
    ),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const PUBLISHER = [PERMISSIONS.TASK_READ, PERMISSIONS.CLIENT_UPDATE_PUBLISH];

it('publishes one update from the queue', async () => {
  signInWith(PUBLISHER);
  const view = await renderScreen(<CompletedTodayScreen onOpenTask={jest.fn()} />);

  await view.findByText('Checkout accepts cards');
  await fireEvent.press(view.getAllByRole('button', { name: 'Publish' })[0]!);

  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(writes()[0]).toMatchObject({ url: expect.stringContaining('/client-updates/u1/publish') });
});

it('publishes the whole queue one at a time', async () => {
  signInWith(PUBLISHER);
  const view = await renderScreen(<CompletedTodayScreen onOpenTask={jest.fn()} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Publish 2 approved' }));

  await waitFor(() => expect(writes()).toHaveLength(2));
  expect(writes().map((write) => write.url)).toEqual([
    expect.stringContaining('/client-updates/u1/publish'),
    expect.stringContaining('/client-updates/u2/publish'),
  ]);
});

it('sends the edited wording trimmed', async () => {
  signInWith(PUBLISHER);
  const view = await renderScreen(<CompletedTodayScreen onOpenTask={jest.fn()} />);

  await view.findByText('Checkout accepts cards');
  await fireEvent.press(view.getAllByRole('button', { name: 'Edit wording' })[0]!);
  await fireEvent.changeText(await view.findByLabelText('Client will read'), '  Pay by card.  ');
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(writes()).toHaveLength(1));
  const [edit] = writes();
  expect(edit).toMatchObject({
    method: 'PATCH',
    url: expect.stringContaining('/client-updates/u1'),
  });
  expect(JSON.parse(edit?.body ?? '{}')).toEqual({
    title: 'Checkout accepts cards',
    body: 'Pay by card.',
  });
});

it('shows a reader without the permission why, and sends nothing', async () => {
  signInWith([PERMISSIONS.TASK_READ]);
  const view = await renderScreen(<CompletedTodayScreen onOpenTask={jest.fn()} />);

  await view.findByText('Checkout accepts cards');
  expect(view.getByText(/Only seniors, managers or admins publish/)).toBeTruthy();
  const publish = view.getAllByRole('button', { name: 'Publish' })[0]!;
  expect(publish.props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(publish);

  await fireEvent.press(view.getByRole('tab', { name: 'Clients see' }));
  expect(await view.findByText('Invoices download as PDF')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  expect(writes()).toHaveLength(0);
});

it('withdraws a published update and opens the task behind a queued one', async () => {
  signInWith(PUBLISHER);
  const onOpenTask = jest.fn();
  const view = await renderScreen(<CompletedTodayScreen onOpenTask={onOpenTask} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Open ACM-12' }));
  expect(onOpenTask).toHaveBeenCalledWith('task-1');

  await fireEvent.press(view.getByRole('tab', { name: 'Clients see' }));
  await fireEvent.press(await view.findByRole('button', { name: 'Withdraw' }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(writes()[0]).toMatchObject({
    url: expect.stringContaining('/client-updates/u9/withdraw'),
  });
});
