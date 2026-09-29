import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths, sessionUser } from '../../shared/testing/harness';
import { problemDetail, problemSummary, routeByPath, sentBody } from './problem-test-data';
import { ProblemsScreen } from './ProblemsScreen';

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const MANAGER = sessionUser({
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  permissions: [PERMISSIONS.PROBLEM_READ, PERMISSIONS.PROBLEM_MANAGE],
});
const READER = sessionUser({
  roleKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
  permissions: [PERMISSIONS.PROBLEM_READ],
});

const PAGE = { items: [problemSummary()], nextCursor: null };

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: MANAGER });
});

describe('the problems list', () => {
  it('opens on the open problems, counting clients rather than tickets', async () => {
    fetchMock.mockImplementation(routeByPath({ '/problems': PAGE }));
    const view = await renderScreen(<ProblemsScreen onOpen={jest.fn()} />);

    expect(await view.findByText('Checkout times out on large carts')).toBeTruthy();
    expect(view.getByText('3 clients')).toBeTruthy();
    expect(view.getByText('Internal — no client ever sees a problem.')).toBeTruthy();
    expect(requestedPaths(fetchMock).some((path) => path.includes('status=OPEN'))).toBe(true);
  });

  it('asks the API for the closed ones when that view is chosen', async () => {
    fetchMock.mockImplementation(routeByPath({ '/problems': PAGE }));
    const view = await renderScreen(<ProblemsScreen onOpen={jest.fn()} />);
    await view.findByText('Checkout times out on large carts');

    await fireEvent.press(view.getByText('Closed'));
    await waitFor(() =>
      expect(requestedPaths(fetchMock).some((path) => path.includes('status=CLOSED'))).toBe(true),
    );
  });

  it('opens a problem when its card is pressed', async () => {
    fetchMock.mockImplementation(routeByPath({ '/problems': PAGE }));
    const onOpen = jest.fn();
    const view = await renderScreen(<ProblemsScreen onOpen={onOpen} />);

    await fireEvent.press(await view.findByText('Checkout times out on large carts'));
    expect(onOpen).toHaveBeenCalledWith('p1');
  });

  it('says so when a view is empty', async () => {
    fetchMock.mockImplementation(routeByPath({ '/problems': { items: [], nextCursor: null } }));
    const view = await renderScreen(<ProblemsScreen onOpen={jest.fn()} />);

    expect(await view.findByText('No problems')).toBeTruthy();
  });
});

describe('opening a problem by hand', () => {
  it('is not offered without problem:manage', async () => {
    restoreSession.mockResolvedValue({ status: 'signed-in', user: READER });
    fetchMock.mockImplementation(routeByPath({ '/problems': PAGE }));
    const view = await renderScreen(<ProblemsScreen onOpen={jest.fn()} />);

    await view.findByText('Checkout times out on large carts');
    expect(view.queryByRole('button', { name: 'New problem' })).toBeNull();
  });

  it('posts the trimmed title and opens what was created', async () => {
    fetchMock.mockImplementation(
      routeByPath({ 'POST /problems': problemDetail({ id: 'p9' }), '/problems': PAGE }),
    );
    const onOpen = jest.fn();
    const view = await renderScreen(<ProblemsScreen onOpen={onOpen} />);

    await fireEvent.press(await view.findByRole('button', { name: 'New problem' }));
    await fireEvent.changeText(view.getByLabelText('Title'), '  Invoices render blank  ');
    await fireEvent.press(view.getByRole('button', { name: 'Open problem' }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('p9'));
    expect(sentBody(fetchMock, '/problems', 'POST')).toMatchObject({
      title: 'Invoices render blank',
      severity: 'HIGH',
    });
  });
});
